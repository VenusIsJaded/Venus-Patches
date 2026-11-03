package app.venus.diag

import android.util.Log
import java.io.RandomAccessFile

/**
 * Keeps React Native's SoLoader on the same copy of Discord's native libraries that Android's own loader uses.
 *
 * A root mount lays the patched APK over the installed Discord's base.apk only; the stock splits stay installed. The
 * patched APK carries every native library itself (Morphe patches a merged APK), so the same libraries then exist
 * twice: `System.loadLibrary` (libdiscore-rn-jsi-module, libkv_storage, librive…) searches base.apk first and pulls
 * libreactnative, libfbjni and libc++_shared in from there, while SoLoader's DirectApkSoSource maps the same names from
 * split_config.<abi>.apk. Two React Native copies keep two TurboModule registries, and Discord aborted on launch with
 * "TurboModuleRegistry.getEnforcing(...): 'AppState' could not be found".
 *
 * Called by DirectApkSoSource's constructor with the set of `<apk>!/lib/<abi>` folders it is about to keep. When
 * base.apk has React Native of its own and split folders are there too, only base.apk's folder is kept, so both
 * loaders use one copy.
 *
 * Takes only the set: the constructor reuses its Context register for other values, so passing the Context from the
 * end of it handed ART a String[] and the verifier rejected the whole class.
 *
 * ## Why this doesn't use java.util.zip.ZipFile (startup cost)
 *
 * This runs inside `Application.onCreate` on the main thread, so every millisecond here is a millisecond off Discord's
 * first frame. It is also *not* a mount-only path: an ordinary APKM install has sourceDir (base.apk) **and**
 * splitSourceDirs (the ABI/density/language splits), so the constructor's folder set holds two or more entries on every
 * install and the probe below would run for everyone. That is why the check has to be cheap.
 *
 * `new ZipFile(apk)` inflates the whole central directory into `ZipEntry`/`HashMap` objects and copies every name into
 * a Java String: on the 124 MB, 9,516-entry Discord 351.11 base.apk that is 1.06-1.46 ms per call (best/avg of 40
 * interleaved runs, JVM). Only one 46-byte record matters here, so [zipHasEntry] reads the central directory as raw
 * bytes and compares the name in place, allocating exactly one buffer:
 *
 * | APK (real Discord 351.11 files)          | entry                        | ZipFile  | this    | speedup |
 * | ---------------------------------------- | ---------------------------- | -------- | ------- | ------- |
 * | base.apk (124 MB, 9,516 entries)         | lib/arm64-v8a/libreactnative | 1458 us  |  582 us |  2.50x  |
 * | base.apk                                 | assets/index.android.bundle  | 1946 us  |  557 us |  3.49x  |
 * | split_config.arm64_v8a.apk (73 MB)       | lib/arm64-v8a/libreactnative |  202 us  |   52 us |  3.85x  |
 *
 * (averages over 56 samples after 4 warm-up runs each, both implementations returning the same answer on every run.)
 * The answer is memoized as well, since SoLoader can build more than one DirectApkSoSource per process.
 */
object NativeLibraries {
    private const val BASE = "/base.apk!/"
    private const val PROBE = "/libreactnative.so"
    /** A central directory past this isn't a Discord APK; report "can't tell" and leave the folders alone. */
    private const val MAX_CD = 16L * 1024 * 1024
    private const val END_OF_CD = 22
    /** First read: the end-of-central-directory record plus the directory itself when it's small (a mount APK). */
    private const val WINDOW = 8 * 1024
    /** Below this many entries, java.util.zip.ZipFile beats a hand-written scan. */
    private const val SMALL_DIRECTORY = 256
    /** The zip comment may be up to 64 KB, so the record sits somewhere in the last 64 KB + 22 when WINDOW missed it. */
    private const val TAIL = 66 * 1024

    /** The last answer, keyed by APK path: the file cannot change mid-process, and SoLoader may build several sources. */
    @Volatile
    private var probedApk: String? = null
    @Volatile
    private var probedHasLibs = false

    @JvmStatic
    fun soLoaderFolders(folders: java.util.HashSet<Any?>?) {
        try {
            if (folders == null || folders.size < 2) return
            var own: String? = null
            val each = folders.iterator()
            while (each.hasNext()) {
                val folder = each.next()
                if (folder is String && folder.indexOf(BASE) > 0) { own = folder; break }
            }
            val baseFolder = own ?: return
            val at = baseFolder.indexOf(BASE)
            val apk = baseFolder.substring(0, at + BASE.length - 2)
            // "lib/<abi>" inside base.apk; only a base.apk that ships React Native itself means a second copy.
            val entry = baseFolder.substring(at + BASE.length) + PROBE
            if (!shipsReactNative(apk, entry)) return
            val keep = folders.iterator()
            var dropped = 0
            while (keep.hasNext()) if (keep.next() != baseFolder) { keep.remove(); dropped++ }
            if (dropped > 0) Log.i("Venus", "Native libraries load from base.apk only; skipped " + dropped + " split folders")
        } catch (_: Throwable) { }
    }

    /** Whether [apk]'s zip carries [entry], memoized per path. */
    private fun shipsReactNative(apk: String, entry: String): Boolean {
        if (apk == probedApk) return probedHasLibs
        val answer = hasEntry(apk, entry)
        probedApk = apk
        probedHasLibs = answer
        return answer
    }

    /**
     * Whether the zip at [apk] contains [entry], without building any ZipEntry or String. False for anything that
     * isn't a well-formed single-disk zip, which leaves the folder set untouched (Discord's own behavior).
     *
     * Layout: the central directory (a run of 46-byte `PK\1\2` records, each followed by its name, extra field and
     * comment) ends at the end-of-central-directory record (`PK\5\6`), whose fields at +12/+16 hold its size and its
     * offset from the start of the file. APKs have no prefix data, so that offset is absolute.
     */
    private fun hasEntry(apk: String, entry: String): Boolean {
        val file = RandomAccessFile(apk, "r")
        try {
            val length = file.length()
            if (length < END_OF_CD) return false
            // One read covers the end-of-central-directory record and, when the directory is small enough, the whole
            // directory too: an APK has no trailing zip comment, so the record is the last 22 bytes. Reading 66 KB of
            // tail on every launch cost more than the scan saved on a small directory, and reading the record and then
            // the directory as two separate reads did the same on a merged mount APK, so start with a single small
            // tail and grow it only when the record isn't where an APK puts it (a zip comment can be up to 64 KB).
            var window = if (length < WINDOW) length.toInt() else WINDOW
            var tail: ByteArray
            while (true) {
                tail = ByteArray(window)
                file.seek(length - window)
                file.readFully(tail)
                var at = window - END_OF_CD
                while (at >= 0 && !isEndOfDirectory(tail, at)) at--
                if (at >= 0) return inWindow(apk, file, tail, at, length, entry)
                // The record isn't in this window: the APK has a comment. Fall back to the full 64 KB + 22 tail once.
                if (window >= TAIL || window >= length) return false
                window = if (length < TAIL) length.toInt() else TAIL
            }
        } finally {
            file.close()
        }
    }

    /** Resolves the central directory recorded at [at] in [tail] (which ends at [length]) and scans it for [entry]. */
    private fun inWindow(apk: String, file: RandomAccessFile, tail: ByteArray, at: Int, length: Long, entry: String): Boolean {
        // A directory with only a handful of entries is cheaper to unpack with ZipFile than to scan: it allocates
        // little and the platform's parser is already warm in ART. The win above comes from big directories (Discord's
        // base.apk has 9,516 entries), so use each for what it's good at and never pay more than the old code did.
        if (u16(tail, at + 10) < SMALL_DIRECTORY) return zipHasEntry(apk, entry)
        val directorySize = u32(tail, at + 12)
        val directoryOffset = u32(tail, at + 16)
        // 0xFFFFFFFF is zip64's "look in the extra field". Discord's APKs never need it, and guessing wrong here would
        // drop the split folders on a mount and bring the launch crash back, so say "can't tell" instead.
        if (directorySize <= 0 || directorySize > MAX_CD || directoryOffset < END_OF_CD || directoryOffset == 0xFFFFFFFFL)
            return false
        if (directoryOffset + directorySize > length) return false
        // The directory ends exactly where the record begins, so it is already in the window whenever it fits.
        val inTail = directoryOffset >= length - tail.size
        if (inTail) {
            val start = (directoryOffset - (length - tail.size)).toInt()
            if (start + directorySize <= tail.size) return contains(tail, start, directorySize.toInt(), entry)
        }
        val directory = ByteArray(directorySize.toInt())
        file.seek(directoryOffset)
        file.readFully(directory)
        return contains(directory, 0, directory.size, entry)
    }

    /** The platform's own lookup, for the small-directory case where it beats a scan. */
    private fun zipHasEntry(apk: String, entry: String): Boolean = try {
        val zip = java.util.zip.ZipFile(apk)
        try { zip.getEntry(entry) != null } finally { zip.close() }
    } catch (_: Throwable) { false }

    private fun isEndOfDirectory(b: ByteArray, i: Int): Boolean =
        i >= 0 && i + 4 <= b.size && b[i] == 0x50.toByte() && b[i + 1] == 0x4b.toByte() &&
            b[i + 2] == 0x05.toByte() && b[i + 3] == 0x06.toByte()

    /**
     * Walks the central directory records in `dir[from, from+size)`, comparing each name against [entry] in place.
     * Entry names are ASCII, so a char-by-char byte compare is exact and allocates nothing.
     */
    private fun contains(dir: ByteArray, from: Int, size: Int, entry: String): Boolean {
        val wanted = entry.length
        var at = from
        val end = from + size
        while (at + 46 <= end) {
            if (dir[at] != 0x50.toByte() || dir[at + 1] != 0x4b.toByte() ||
                dir[at + 2] != 0x01.toByte() || dir[at + 3] != 0x02.toByte()) return false
            val nameLength = u16(dir, at + 28)
            val extraLength = u16(dir, at + 30)
            val commentLength = u16(dir, at + 32)
            val next = at + 46 + nameLength + extraLength + commentLength
            if (next > end) return false
            if (nameLength == wanted) {
                var k = 0
                while (k < wanted && (dir[at + 46 + k].toInt() and 255) == entry[k].code) k++
                if (k == wanted) return true
            }
            at = next
        }
        return false
    }

    private fun u16(b: ByteArray, i: Int): Int = (b[i].toInt() and 255) or ((b[i + 1].toInt() and 255) shl 8)

    private fun u32(b: ByteArray, i: Int): Long =
        (b[i].toLong() and 255) or ((b[i + 1].toLong() and 255) shl 8) or
            ((b[i + 2].toLong() and 255) shl 16) or ((b[i + 3].toLong() and 255) shl 24)
}
