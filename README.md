# Venus Patches

Independent Discord attachment tools for use with **Morphe**. Small, bundled patches—not a full Discord client mod or a remote plugin loader.

[Add to Morphe](https://morphe.software/add-source?github=VenusIsJaded/Venus-Patches&name=Venus%20Patches) · [Downloads](https://github.com/VenusIsJaded/Venus-Patches/releases) · [Report a problem](https://github.com/VenusIsJaded/Venus-Patches/issues)

> **Experimental release.** Compilation, automated logic tests and patch placement are checked separately from Android runtime behavior. Device launch, hardware codec compatibility and sending/playing messages on Discord still require real-device testing. Do not mistake a successful patch build for an end-to-end device test.

## What you get

| Patch | Function | Runtime default |
| --- | --- | --- |
| **File size on picker** | Adds readable local file sizes to media-picker thumbnails. | On |
| **Custom voice messages** | Converts supported local audio to Ogg/Opus, derives its actual duration and waveform, and prepares a native voice-message payload. | Off—enable explicitly |
| **Venus settings** | Adds an in-app menu with persistent switches and hook diagnostics. Required by both features. | Always available |

Tap the small **Venus** button above Discord's bottom navigation to open the menu. This is a dedicated floating menu, not a replacement for Discord's account settings. Switches apply without reinstalling; reopen the picker after changing its switch. Only features selected while patching are offered.

## Install

1. Install a current [Morphe Manager](https://github.com/MorpheApp/morphe-manager/releases).
2. Open **[Add Venus Patches to Morphe](https://morphe.software/add-source?github=VenusIsJaded/Venus-Patches&name=Venus%20Patches)** and confirm the source. Alternatively, choose **Sources → + → Remote** and paste:
   ```text
   https://github.com/VenusIsJaded/Venus-Patches
   ```
3. Select the original **Discord 347.12 - Stable**, version code **347012**, in **APKM** format. Use the unmodified APKM, not an already-patched client.
4. Select the features you want; keep **Venus settings** enabled. Let Morphe merge the splits, patch and sign the APK.
5. Install the result and open the Venus menu. Turn **Send audio as voice messages** on when needed.

The `main` branch's `patches-bundle.json` points to the experimental release. It can be imported as a normal repository source even though GitHub labels the release a prerelease. There is no separate `dev` update channel yet.

**Local import:** download `patches-1.0.0-dev.1.mpp` from Releases, then choose **Sources → + → Local**. A local source does not update itself.

**Startup hotfix (2026-10-03):** the `1.0.0-dev.1` prerelease asset was replaced. Refresh/redownload the Venus source before patching the **original APKM** again; do not reuse a cached bundle or patch the crashing APK. Local sources must be reimported. Keep your existing Morphe signing key if you want to install the result as an update without clearing app data.

**Signing:** a patched APK has a different signing certificate from official Discord. Android may require uninstalling official Discord first; understand the loss of local app data before doing so. Future patched updates must use the same signing key. Never share your signing key.

## Voice messages: closer to native, without pretending

The reference plugin supplies a constant waveform and a fixed 60-second duration and changes the MIME label without re-encoding the audio. Venus instead implements:

- A native **MediaExtractor → MediaCodec → Ogg MediaMuxer** conversion path.
- **48 kHz, mono, 64 kbit/s Opus** output—not a renamed MP3.
- Duration calculated from the PCM actually processed and a waveform derived from its amplitude.
- Preparation at Discord's existing asynchronous native-upload boundary, before it uploads the converted URI.
- Voice flag `8192` added to the final message payload **without overwriting other flags**.
- Original files left untouched. Temporary output lives only in Discord's private cache.

Send **one audio attachment with no accompanying text, stickers, poll or extra attachments** for a voice message. Mixed messages stay ordinary attachments because Discord's voice-message payload has restrictions. Existing recorded voice messages are left alone.

### Format and device limits

- Real conversion requires **Android 10 / API 29 or newer** and an available Opus encoder. The picker and menu support Android 8+.
- Android-decodable audio is accepted. Common candidates include MP3, AAC/M4A, WAV, FLAC, Ogg/Vorbis and Opus; support depends on the device's extractor/decoder. These are not all claimed as device-tested.
- “Any audio” cannot honestly include unsupported codecs, DRM, corrupt files or inaccessible content URIs. On failure, Venus reports the error and lets Discord upload the **original ordinary file** instead of falsely marking it as a voice message.
- Conversion has a 20-minute audio safety limit and a 10-minute processing deadline. Discord's own size and channel-permission rules still apply.
- Native voice conversion is lossy and mono. Keep the ordinary attachment workflow if preserving the original audio file or stereo is important.

## Performance and privacy

**Picker**
- Reads local size metadata asynchronously—no full-file reads or remote URL probing.
- Deduplicates simultaneous requests for the same URI, including zero-byte files.
- At most **four** metadata reads at once; a **256-entry** cache.
- Successful results expire after five minutes; failed reads after 30 seconds. Disabling clears queued work and cached results.
- Does not mutate React props or intercept touches on the size badge.

**Voice**
- One codec worker with a bounded four-job waiting queue; no decoding on the UI/JS thread.
- Streaming PCM conversion rather than holding the entire decoded recording in memory or sending base64 audio through React Native.
- Per-upload Promise reuse prevents duplicate conversions on retries. Cancelling an upload or turning the switch off cancels pending work.
- Abandoned converted outputs are pruned during subsequent conversions: at most 32 outputs retained, with six-hour expiry. Original source files are never deleted.

**Runtime**
- Only **eight inspected Metro factories** are wrapped; unrelated factories pass through unchanged. No eager module scans, polling timers or extra network requests.
- The feature code is included in the patched APK. No Vendetta/Revenge runtime, downloaded JavaScript, analytics or account-token handling.
- Switches are stored in `venus-patches.json` in Discord's private documents directory. Failed persistence is reported in the menu; switches still work for the session.

## Compatibility and integration points

The patches refuse a different embedded JavaScript bundle, even if its displayed version happens to match. The inspected Hermes asset's SHA-256 is:

```text
834bb2c88a7d8e508039e11be90a2a09f9f87017fdceef1999cf099933a6be35
```

| Integration | Inspected location |
| --- | --- |
| Bundled runtime | `ReactInstance.loadJSBundle(JSBundleLoader)` |
| Native voice bridge | `FileModule.getSize(String, Promise)`—private `venus-voice-v1:` requests dispatch to the extension; normal sizes fall through |
| React / React Native | Metro modules `19` / `17` |
| Menu registration | `AppRegistry`, module `245`; only the `Discord` root is wrapped |
| Picker tiles | `Pressable`, module `414`, with `localImageSource` children |
| Local files | `NativeFileModule`, module `1151` |
| Audio preparation | `CloudUpload.reactNativeCompressAndExtractData`, module `5375` |
| Attachment serialization | `getAttachmentPayload`, module `5377` |
| Message flag | Discord `HTTPUtils.post` / `HTTP.post`, module `1271`, only `/channels/{id}/messages` |

**OTA JavaScript bundles are deliberately not used:** startup is pinned to the inspected packaged bundle so cached updates cannot silently invalidate module IDs. This also prevents Discord's OTA bug fixes from taking effect. Update the APK and these patches together when another version is supported. Do not combine this source with another client loader or patches touching these methods.

## Build and test

Requires **Java 21**, **Python 3.11+**, **Node.js 20+**, internet access for the first tool download, and `unzip`. No GitHub Packages PAT is needed.

```bash
python3 scripts/build.py
# Or, using the included Gradle wrapper:
./gradlew buildAndroid
```

Toolchain downloads are pinned and SHA-256 checked. The `.mpp` contains JVM patch classes, Android patch DEX, bundled JavaScript and a native `.mpe` extension. Discord APKs, compile-only bridge stubs and downloaded tool binaries are not distributed in the bundle.

Output: `patches/build/libs/patches-1.0.0-dev.1.mpp` and `SHA256SUMS`. `patches-list.json` is generated from the actual compiled patch objects, not maintained as a guessed feature list.

Runtime regression tests can also be run independently:

```bash
node --test tests/runtime.test.cjs
```

`tests/native/PcmToolsTest.kt` checks generated PCM signals, durations, sample rates, downmixing, waveform amplitude and chunk invariance. `tests/native/VerifyApk.kt` checks the patched DEX entry points, private native invocation opcode, extension method resolution against Discord's actual obfuscated classes, ordinary-size bypass, packaged asset and signing certificate. These checks do **not** simulate a physical Android codec or Discord's servers.

The startup hotfix corrects an `invoke-virtual` call to a **private** native loader to `invoke-direct`. It also removes native extension calls to Kotlin helper methods absent from Discord's R8-obfuscated runtime, using Java APIs instead. Ordinary `getSize` requests are prefix-checked before invoking the extension. The strengthened verifier rejects the original release for these ABI faults.

### Device acceptance checklist

Before treating a release as stable, check on a real device:
- Discord launches, the Venus menu opens, switches persist after restarting, and disabled features remain inactive.
- Picker badges work while scrolling, on zero-byte files and on denied content URIs without blocking taps.
- MP3, AAC/M4A, WAV, FLAC and Ogg/Opus upload as playable native-looking voice messages with plausible duration and waveform.
- Cancelling conversion, low storage, unsupported formats, mixed messages and normal recorded voice messages behave safely.

## Credits and licensing

Inspired by [Martinz64's FileSizeOnPicker](https://martinz64.github.io/vendetta-plugins/FileSizeOnPicker/) ([source](https://github.com/Martinz64/vendetta-plugins), Unlicense) and [shipwr3ckd/siguma's Custom Voice Messages](https://shipwr3ckd.github.io/revengeplugin/customVoiceMessages/) ([source](https://github.com/shipwr3ckd/revengeplugin), CC0). The runtime and native conversion are independent implementations for the inspected Discord build, not unmodified plugin bundles.

Built against the [official Morphe patcher and template](https://github.com/MorpheApp/morphe-patches-template). See Morphe's [patch sources guide](https://github.com/MorpheApp/morphe-manager/blob/main/docs/patch-sources.md) and [development documentation](https://github.com/MorpheApp/morphe-patcher/tree/main/docs).

Venus Patches is licensed under [GPL-3.0](LICENSE), with the upstream branding notice retained in [NOTICE](NOTICE). This project is not affiliated with Discord or Morphe. Releases contain patches only, not Discord APKs. Use modified clients at your own risk and review Discord's terms.
