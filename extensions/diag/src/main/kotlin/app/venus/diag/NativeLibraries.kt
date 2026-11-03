package app.venus.diag

import android.util.Log
import java.util.zip.ZipFile

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
 * loaders use one copy. A normal or Shizuku install is one APK (one folder) and returns at once.
 *
 * Takes only the set: the constructor reuses its Context register for other values, so passing the Context from the
 * end of it handed ART a String[] and the verifier rejected the whole class.
 */
object NativeLibraries {
    private const val BASE = "/base.apk!/"
    private const val PROBE = "/libreactnative.so"

    @JvmStatic
    fun soLoaderFolders(folders: java.util.HashSet<Any?>?) {
        try {
            if (folders == null || folders.size < 2) return
            var own: String? = null
            val each = folders.iterator()
            while (each.hasNext()) {
                val folder = each.next() as? String ?: continue
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
            val zip = ZipFile(apk)
            val ships = try { zip.getEntry(entry) != null } finally { zip.close() }
            if (!ships) return
            val keep = folders.iterator()
            var dropped = 0
            while (keep.hasNext()) if (keep.next() != baseFolder) { keep.remove(); dropped++ }
            if (dropped > 0) Log.i("Venus", "Native libraries load from base.apk only; skipped " + dropped + " split folders")
        } catch (_: Throwable) { }
    }
}
