package app.venus.patches

import app.morphe.patcher.Fingerprint
import app.morphe.patcher.extensions.InstructionExtensions.addInstructions
import app.morphe.patcher.patch.ApkFileType
import app.morphe.patcher.patch.AppTarget
import app.morphe.patcher.patch.Compatibility
import app.morphe.patcher.patch.bytecodePatch
import app.morphe.patcher.patch.rawResourcePatch
import app.morphe.patcher.patch.PatchException
import java.security.MessageDigest

private const val INSTANCE = "Lcom/facebook/react/runtime/ReactInstance;"
private val discord = Compatibility(
    packageName = "com.discord",
    name = "Discord",
    apkFileType = ApkFileType.APKM,
    appIconColor = 0x5865F2,
    targets = listOf(AppTarget(
        version = "347.12 - Stable",
        versionCode = 347012,
        minSdk = 26,
        description = "Pinned Discord 347.12 bundle; Android device validation still required."
    ))
)

// Reset per run: Manager can reuse a loaded bundle for multiple selections.
private var pickerSelected = false
private var voiceSelected = false
private var copyBiosSelected = false
private var dashlessSelected = false
private var favouriteAnythingSelected = false
private var freeNitroSelected = false
private val additionalSelections = mutableSetOf<String>()
private val runtimeAssets = rawResourcePatch {
    execute {
        additionalSelections.clear()
        pickerSelected = false
        voiceSelected = false
        copyBiosSelected = false
        dashlessSelected = false
        favouriteAnythingSelected = false
        freeNitroSelected = false
        // Module IDs are inspected against this exact embedded Hermes bundle, not guessed.
        val hash = MessageDigest.getInstance("SHA-256")
        get("assets/index.android.bundle").inputStream().use { stream ->
            val buffer = ByteArray(65536)
            var count = stream.read(buffer)
            while (count >= 0) {
                hash.update(buffer, 0, count)
                count = stream.read(buffer)
            }
        }
        val digest = hash.digest().joinToString("") { "%02x".format(it) }
        if (digest != "834bb2c88a7d8e508039e11be90a2a09f9f87017fdceef1999cf099933a6be35")
            throw PatchException("Unsupported Discord JavaScript bundle; use the original 347.12 - Stable APKM")
    }
    finalize {
        val bootstrap = object {}.javaClass.getResourceAsStream("/venus/bootstrap.js")
            ?.bufferedReader()?.use { it.readText() }
            ?: throw PatchException("Venus runtime asset missing from bundle")
        val asset = get("assets/venus/bootstrap.js", false)
        asset.parentFile.mkdirs()
        val selected = bootstrap.replace(
            "/*__FEATURES__*/",
            "{picker:$pickerSelected,voice:$voiceSelected,copyBios:$copyBiosSelected," +
                "dashless:$dashlessSelected,favouriteAnything:$favouriteAnythingSelected,freeNitro:$freeNitroSelected," +
                listOf("noTyping", "quickDelete", "noDelete", "jumpToTop", "hiddenChannels")
                    .joinToString(",") { "$it:${it in additionalSelections}" } + "}"
        )
        asset.writeText(selected)
        // One main bundle load: the prelude runs inside the existing HBC98 global entry,
        // so RN cannot mark a separate bootstrap bundle ready or flush native calls early.
        val injected = HbcPrelude.inject(get("assets/index.android.bundle"), selected)
        get("assets/venus/injection.json", false).writeText(
            "{\"revision\":\"1.1.0\",\"prefixSize\":${injected.prefixSize}," +
                "\"originalCodeSize\":${injected.originalCodeSize},\"codeOffset\":${injected.codeOffset}}"
        )
    }
}

private object BundleLoader : Fingerprint(
    definingClass = INSTANCE,
    name = "loadJSBundle",
    returnType = "V",
    parameters = listOf("Lcom/facebook/react/bridge/JSBundleLoader;")
)

@Suppress("unused")
val venusSettings = bytecodePatch(
    name = "Venus settings",
    description = "Adds a native Venus section in Discord settings with General, Plugins and persistent controls."
) {
    compatibleWith(discord)
    dependsOn(runtimeAssets)
    execute {
        val method = BundleLoader.method
        val owner = BundleLoader.originalClassDef
        if (owner.fields.none {
            it.name == "context" && it.type == "Lcom/facebook/react/runtime/BridgelessReactContext;"
        }) throw PatchException("Discord's React Native context ABI changed")
        val loader = Fingerprint(
            definingClass = "Lcom/facebook/react/bridge/JSBundleLoader;",
            name = "createAssetLoader",
            parameters = listOf("Landroid/content/Context;", "Ljava/lang/String;", "Z")
        ).originalMethod
        if (loader.returnType != "Lcom/facebook/react/bridge/JSBundleLoader;")
            throw PatchException("Asset loader factory ABI changed")
        // Pin JS execution to the inspected packaged bundle, avoiding incompatible OTA cache bundles.
        // 347.12 has two scratch locals; p1 is deliberately replaced with an asset loader.
        if ((method.implementation?.registerCount ?: 0) - 2 < 2)
            throw PatchException("Bundle loader no longer has two safe scratch registers")
        method.addInstructions(0, """
            iget-object v0, p0, $INSTANCE->context:Lcom/facebook/react/runtime/BridgelessReactContext;
            const-string v1, "assets://index.android.bundle"
            const/4 p1, 0x0
            invoke-static {v0, v1, p1}, Lcom/facebook/react/bridge/JSBundleLoader;->createAssetLoader(Landroid/content/Context;Ljava/lang/String;Z)Lcom/facebook/react/bridge/JSBundleLoader;
            move-result-object p1
        """)
    }
}

@Suppress("unused")
val fileSizeOnPicker = rawResourcePatch(
    name = "File size on picker",
    description = "Displays cached, asynchronously resolved file sizes on media picker tiles."
) {
    compatibleWith(discord)
    dependsOn(venusSettings)
    execute { pickerSelected = true }
}

@Suppress("unused")
val copyBios = rawResourcePatch(
    name = "CopyBios",
    description = "Makes profile bio text selectable without changing links or the original React elements."
) {
    compatibleWith(discord)
    dependsOn(venusSettings)
    execute { copyBiosSelected = true }
}

@Suppress("unused")
val dashless = rawResourcePatch(
    name = "Dashless",
    description = "Displays spaces instead of dashes in text channel names without changing stored names."
) {
    compatibleWith(discord)
    dependsOn(venusSettings)
    execute { dashlessSelected = true }
}

@Suppress("unused")
val favouriteAnything = rawResourcePatch(
    name = "FavouriteAnything",
    description = "Adds image and video favourites in the media viewer with cached video previews."
) {
    compatibleWith(discord)
    dependsOn(venusSettings)
    execute { favouriteAnythingSelected = true }
}

@Suppress("unused")
val freeNitro = rawResourcePatch(
    name = "FreeNitro",
    description = "Shares unavailable custom emojis and stickers as Discord CDN links, with separate switches. Does not grant Nitro."
) {
    compatibleWith(discord)
    dependsOn(venusSettings)
    execute { freeNitroSelected = true }
}

@Suppress("unused")
val customVoiceMessages = bytecodePatch(
    name = "Custom voice messages",
    description = "Converts supported local audio to Ogg/Opus with real waveform and duration, off the UI thread. Android 10+."
) {
    compatibleWith(discord)
    dependsOn(venusSettings)
    extendWith("extensions/voice.mpe")
    execute {
        voiceSelected = true
        val fileSize = Fingerprint(
            definingClass = "Lcom/discord/file_manager/FileModule;",
            name = "getSize",
            returnType = "V",
            parameters = listOf("Ljava/lang/String;", "Lcom/facebook/react/bridge/Promise;")
        ).method
        if ((fileSize.implementation?.registerCount ?: 0) - 3 < 2)
            throw PatchException("File bridge no longer has two safe scratch registers")
        // Existing TurboModule schemas cannot expose arbitrary new ReactMethod functions.
        // Dispatch a private URI prefix through the existing Promise bridge; normal size requests fall through.
        fileSize.addInstructions(0, """
            const-string v0, "venus-voice-v1:"
            invoke-virtual {p1, v0}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z
            move-result v0
            if-eqz v0, :venus_original_size
            invoke-virtual {p0}, Lcom/facebook/react/bridge/ReactContextBaseJavaModule;->getReactApplicationContext()Lcom/facebook/react/bridge/ReactApplicationContext;
            move-result-object v0
            invoke-static {p1, p2, v0}, Lapp/venus/extension/VoiceProcessor;->dispatch(Ljava/lang/String;Lcom/facebook/react/bridge/Promise;Landroid/content/Context;)Z
            move-result v1
            if-eqz v1, :venus_original_size
            return-void
            :venus_original_size
            nop
        """)
    }
}

// Independently selectable offline ports; no Vendetta/Revenge loader dependency.
private fun bundledPlugin(key: String, title: String, summary: String) = rawResourcePatch(
    name = title,
    description = summary
) {
    compatibleWith(discord)
    dependsOn(venusSettings)
    execute { additionalSelections += key }
}

@Suppress("unused")
val noTyping = bundledPlugin("noTyping", "No typing", "Hides outgoing typing indicators without changing incoming typing events.")

@Suppress("unused")
val quickDelete = bundledPlugin("quickDelete", "QuickDelete", "Opt-in removal of message and embed confirmations, matched using Discord's localized strings.")

@Suppress("unused")
val noDelete = bundledPlugin("noDelete", "NoDelete", "Opt-in, session-only retention of cached deleted messages, visibly marked and bounded to 512 entries.")

@Suppress("unused")
val jumpToTop = bundledPlugin("jumpToTop", "JumpToTop", "Adds a jump-to-start control to the native chat without replacing Jump to Present.")

@Suppress("unused")
val hiddenChannels = bundledPlugin("hiddenChannels", "Hidden Channels", "Opt-in display of already-received locked channel metadata. Does not grant message or voice access.")
