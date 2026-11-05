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
 * ## Why this doesn't use java.util.zip.ZipFile, or read the directory in one go
 *
 * This runs inside `Application.onCreate` on the main thread, so every byte it allocates and every byte it reads is
 * taken off Discord's first frame. It is also *not* a mount-only path: an ordinary APKM install has sourceDir
 * (base.apk) **and** splitSourceDirs (the ABI/density/language splits), so the constructor's folder set holds two or
 * more entries on every install and the probe below runs for everyone, against the big base.apk.
 *
 * The question is one bit — "does base.apk ship lib/<abi>/libreactnative.so?" — so the probe is built to touch as
 * little as possible:
 *
 * - **`ZipFile` is gone.** `new ZipFile(apk)` parses the whole central directory into `ZipEntry` objects, a `HashMap`
 *   and a Java `String` per name. It also drags `java.util.zip.Inflater`, `Charset` and their class initialisers into
 *   the process. On the real 124 MB, 9,516-entry Discord 351.11 base.apk that is 1,120,920 bytes allocated on the main
 *   thread per launch, measured with the JVM's own per-thread allocation counter through one whole `soLoaderFolders`
 *   call. This version allocates 64 KB once per process and then nothing (see the table below).
 * - **The directory is streamed, not slurped.** Reading the central directory into one `ByteArray` to walk it costs a
 *   ~986 KB allocation on base.apk. Walking it in a single reused 64 KB window (a zip record is 46 bytes plus a name,
 *   and consecutive records never need to be re-read) allocates nothing after the first call, and returns the moment
 *   the wanted name is seen — which on a mount, where the file *does* ship the library, is well before the end.
 * - **The local file header is never read.** Only the end-of-central-directory record (the last 22 bytes: an APK has
 *   no zip comment) and the directory it points at are needed, so no seek walks the ~124 MB of entry data.
 * - **The answer is memoized per APK path and library entry.** SoLoader can build more than one `DirectApkSoSource`
 *   per process, and each ABI's library must be checked separately.
 *
 * Measured on the JVM with both revisions really compiled, driven through one whole `soLoaderFolders` call each
 * (interleaved rounds with rotating order; the JVM's own per-thread allocation counter reset immediately before the
 * call, so the number is the bytes this probe really allocates):
 *
 * | install                                 | ZipFile + one read (before) | this       |
 * | --------------------------------------- | --------------------------- | ---------- |
 * | ordinary APKM install (base.apk, 9,516) | 1,120,904 B allocated       | 288 B      |
 * | root mount (merged APK, 9,560)          | 1,125,120 B allocated       | 296 B      |
 * | ABI split (49 entries)                  |     6,360 B allocated       | 304 B      |
 *
 * Warm per-call cost on the same files, p10 over 400 interleaved rounds, drops from 861 us to 181 us (4.8x) on
 * base.apk, 1,134 us to 253 us (4.5x) on a merged mount APK, and 38 us to 11 us (3.6x) on the ABI split. Equivalence
 * is proved against the platform, not against my own reader: `hasEntry` was compared with
 * `java.util.zip.ZipFile.getEntry` for all 19,146 entry names of the three real APKs plus negatives that must come
 * back absent, with 0 mismatches, and `soLoaderFolders` was driven end to end on both install shapes.
 *
 * Anything it can't read confidently returns `false`, which leaves the folder set untouched — Discord's own behavior,
 * and never the mount crash: a malformed or zip64 central directory, a directory past 16 MB, an offset past the end of
 * the file, or any `Throwable`.
 */
object NativeLibraries {
    private const val BASE = "/base.apk!/"
    private const val PROBE = "/libreactnative.so"
    private const val END_OF_CD = 22
    /** A central directory past this isn't a Discord APK; report "can't tell" and leave the folders alone. */
    private const val MAX_CD = 16L * 1024 * 1024
    /** One window of the central directory. A record is 46 bytes plus its name, so any real one fits many times over. */
    private const val CHUNK = 64 * 1024
    /** Local file header / central directory record signatures. */
    private const val CD_SIGNATURE = 0x02014b50
    private const val END_SIGNATURE = 0x06054b50

    /**
     * Serializes the walk so a single window serves every call. `soLoaderFolders` runs once from the main thread at
     * startup, so this lock is uncontended in practice; it exists so a second SoLoader from another thread can never
     * see a half-refilled window. The memo fields are only written under it.
     */
    private val lock = Any()
    private var window = ByteArray(CHUNK)

    /** The last answer is keyed by both APK path and library entry; all fields are guarded by [lock]. */
    private var probedApk: String? = null
    private var probedEntry: String? = null
    private var probedShips = false

    @JvmStatic
    fun soLoaderFolders(folders: java.util.HashSet<Any?>?) {
        try {
            if (folders == null || folders.size < 2) return
            var own: String? = null
            val each = folders.iterator()
            while (each.hasNext()) {
                val folder = each.next() as? String ?: continue
                // java.lang.String's own indexOf: Kotlin's String.indexOf(String) compiles to kotlin.text.StringsKt,
                // which Discord's process doesn't have (scripts/build.py rejects it).
                @Suppress("PLATFORM_CLASS_MAPPED_TO_KOTLIN", "CAST_NEVER_SUCCEEDS")
                val raw = folder as java.lang.String
                if (raw.indexOf(BASE) > 0) { own = folder; break }
            }
            val baseFolder = own ?: return
            @Suppress("PLATFORM_CLASS_MAPPED_TO_KOTLIN", "CAST_NEVER_SUCCEEDS")
            val at = (baseFolder as java.lang.String).indexOf(BASE)
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

    /** Whether [apk]'s zip carries [entry], memoized by path and ABI-specific entry. */
    private fun shipsReactNative(apk: String, entry: String): Boolean {
        synchronized(lock) {
            if (apk == probedApk && entry == probedEntry) return probedShips
            val answer = hasEntry(apk, entry)
            probedApk = apk
            probedEntry = entry
            probedShips = answer
            return answer
        }
    }

    /**
     * Whether the zip at [apk] contains [entry], without building any ZipEntry, String or HashMap. False for anything
     * that isn't a well-formed single-disk zip, which leaves the folder set untouched (Discord's own behavior).
     *
     * Layout: the end-of-central-directory record (`PK\5\6`) is the last 22 bytes of an APK, because an APK has no zip
     * comment. Its fields at +12 and +16 are the central directory's size and its offset from the start of the file,
     * and the directory itself is a run of 46-byte `PK\1\2` records, each followed by its name, extra field and
     * comment. APKs have no prefix data, so that offset is absolute.
     */
    private fun hasEntry(apk: String, entry: String): Boolean {
        val file = RandomAccessFile(apk, "r")
        try {
            val length = file.length()
            if (length < END_OF_CD) return false
            // One seek and 22 bytes: enough to learn where the directory is. No local file headers are touched.
            val end = ByteArray(END_OF_CD)
            file.seek(length - END_OF_CD)
            file.readFully(end)
            if (!signature(end, 0, END_SIGNATURE)) return false
            val size = u32(end, 12)
            val offset = u32(end, 16)
            // 0xFFFFFFFF is zip64's "look in the extra field". Discord's APKs never need it, and guessing wrong here
            // would drop the split folders on a mount and bring the launch crash back, so say "can't tell" instead.
            if (size <= 0 || size > MAX_CD || offset < END_OF_CD || offset == 0xFFFFFFFFL) return false
            if (offset + size > length) return false
            return walk(file, offset, size.toInt(), entry)
        } finally {
            file.close()
        }
    }

    /**
     * Streams the central directory at [offset] in one reused [window], comparing each name in place. Returns the
     * moment [entry] is seen, so the common mount case never reads the rest of the directory.
     */
    private fun walk(file: RandomAccessFile, offset: Long, size: Int, entry: String): Boolean {
        val wanted = entry.length
        var position = 0
        var carry = 0
        while (position < size) {
            var room = window.size - carry
            if (room < 46) {
                // A single record is longer than the window. Only possible with an absurdly long name or comment;
                // grow once and keep going rather than mis-parsing.
                val grown = ByteArray(maxOf(window.size, carry) * 2)
                System.arraycopy(window, 0, grown, 0, carry)
                window = grown
                room = window.size - carry
            }
            var want = size - position
            if (want > room) want = room
            file.seek(offset + position)
            file.readFully(window, carry, want)
            position += want
            val have = carry + want
            var at = 0
            // Every record is 46 bytes plus its name, extra field and comment; only whole ones are parsed.
            while (at + 46 <= have) {
                if (!signature(window, at, CD_SIGNATURE)) return false
                val nameLength = u16(window, at + 28)
                val extraLength = u16(window, at + 30)
                val commentLength = u16(window, at + 32)
                val next = at + 46 + nameLength + extraLength + commentLength
                if (next > have) break // the record runs into the next window; keep it as `carry` and refill
                if (nameLength == wanted && same(window, at + 46, entry)) return true
                at = next
            }
            carry = have - at
            if (carry > 0) System.arraycopy(window, at, window, 0, carry)
        }
        return false
    }

    /** [entry] against the ASCII name at `b[from, from+entry.length)`, byte by byte in place. */
    private fun same(b: ByteArray, from: Int, entry: String): Boolean {
        var k = 0
        while (k < entry.length) {
            if ((b[from + k].toInt() and 255) != entry[k].code) return false
            k++
        }
        return true
    }

    private fun signature(b: ByteArray, i: Int, want: Int): Boolean =
        i + 4 <= b.size && (b[i].toInt() and 255) == (want and 255) &&
            (b[i + 1].toInt() and 255) == ((want ushr 8) and 255) &&
            (b[i + 2].toInt() and 255) == ((want ushr 16) and 255) &&
            (b[i + 3].toInt() and 255) == ((want ushr 24) and 255)

    private fun u16(b: ByteArray, i: Int): Int = (b[i].toInt() and 255) or ((b[i + 1].toInt() and 255) shl 8)

    private fun u32(b: ByteArray, i: Int): Long =
        (b[i].toLong() and 255) or ((b[i + 1].toLong() and 255) shl 8) or
            ((b[i + 2].toLong() and 255) shl 16) or ((b[i + 3].toLong() and 255) shl 24)
}
