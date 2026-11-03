package app.venus.patches

import app.morphe.patcher.patch.InstallerType
import app.morphe.patcher.patch.PatchAvailability
import app.morphe.patcher.patch.PatchException
import app.morphe.patcher.patch.rawResourcePatch

/** Native libraries live under this folder of an APK. */
internal const val NATIVE_LIBRARY_FOLDER = "lib/"

private const val OLD_MORPHE = "Update Morphe Manager: this version can't leave Discord's native libraries out for a root mount"

/**
 * Root mount install.
 *
 * Morphe patches a merged APK: every split of the APKM, so Discord's native libraries (`libreactnative.so`,
 * `libfbjni.so`, `libc++_shared.so`, …) from `split_config.arm64_v8a.apk` land in the patched APK's own `lib/`.
 * A root mount then bind-mounts that APK over the installed Discord's `base.apk` only. Its splits stay installed and
 * Android keeps loading code from them, so the same libraries exist twice:
 *
 * - `System.loadLibrary` (libdiscore-rn-jsi-module, libkv_storage, librive…) searches `base.apk!/lib/<abi>` first,
 *   finds the patched copies, and their dependencies libreactnative, libfbjni and libc++_shared come from base.apk too.
 * - React Native's SoLoader maps the same names straight from `split_config.arm64_v8a.apk`.
 *
 * Two copies of React Native in one process keep two TurboModule registries: Discord's JS asks one for `AppState`,
 * the module was registered in the other, and Hermes aborts with "TurboModuleRegistry.getEnforcing(...): 'AppState'
 * could not be found" before anything is drawn (SIGABRT on mqt_v_js). Normal installs never see it, since there the
 * merged APK is the only APK.
 *
 * Venus ships no native code, and the stock base.apk has no `lib/` either, so on a mount the patched APK leaves `lib/`
 * out and every library loads from the stock split, exactly like unpatched Discord (a mount requires the same version).
 */
@Suppress("unused")
val rootMountSupport = rawResourcePatch(
    name = "Root mount support",
    description = "Leaves Discord's native libraries in the installed app, so a root mount install doesn't crash on " +
        "launch. Only for root mount installs, where it's turned on by itself.",
    default = false,
) {
    compatibleWith(discord)
    section(PLUGINS)
    // REQUIRED on a mount (Manager selects and locks it), UNAVAILABLE everywhere else: on a normal install the
    // patched APK is the whole app, so leaving its libraries out would stop Discord from starting at all.
    availability { installer, _ ->
        if (installer == InstallerType.MOUNT) PatchAvailability.REQUIRED else PatchAvailability.UNAVAILABLE
    }

    execute {
        val libraries = try {
            listApkEntries(NATIVE_LIBRARY_FOLDER)
        } catch (_: LinkageError) {
            throw PatchException(OLD_MORPHE)
        }
        if (libraries.isEmpty()) return@execute
        try {
            delete(NATIVE_LIBRARY_FOLDER)
        } catch (_: LinkageError) {
            throw PatchException(OLD_MORPHE)
        }
    }
}
