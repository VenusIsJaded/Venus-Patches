# Venus Patches

Independent Discord tools for use with **Morphe**. Small, bundled patches—not a full Discord client mod or a remote plugin loader.

[Add to Morphe](https://morphe.software/add-source?github=VenusIsJaded/Venus-Patches&name=Venus%20Patches) · [Downloads](https://github.com/VenusIsJaded/Venus-Patches/releases) · [Report a problem](https://github.com/VenusIsJaded/Venus-Patches/issues)

> **Release channel: 1.0.0 (non-prerelease).** Compilation, automated regression tests and patch placement are checked separately from Android runtime behavior. Real-device launch, native settings interaction, media sharing and hardware codecs still need device validation. A successful build is not an end-to-end device test.

## What you get

| Patch | Function | Runtime default |
| --- | --- | --- |
| **File size on picker** | Adds readable local file sizes to media-picker thumbnails. | On |
| **Custom voice messages** | Converts supported local audio to Ogg/Opus, derives its actual duration and waveform, and prepares a native voice-message payload. | Off—enable explicitly |
| **CopyBios** | Makes profile bio text selectable, preserving clickable links. | On |
| **Dashless** | Displays spaces instead of dashes in text channel names. | On |
| **FavouriteAnything** | Favourites images and videos through the media viewer. | On |
| **FreeNitro** | Shares unavailable custom emojis and stickers as CDN links. | Emoji and sticker switches independently on |
| **Venus settings** | Native Discord settings section with General, Plugins and persistent controls. | Always available |

**Open Discord Settings → Venus → General or Plugins.** The Venus section appears after the Account section using Discord's native settings rows, page navigation and themes. There is no floating button, root overlay or authors list. Switches apply without reinstalling; reopen an already-visible picker or media viewer after toggling its feature. Only patches selected in Morphe are offered.

## Install

1. Install a current [Morphe Manager](https://github.com/MorpheApp/morphe-manager/releases).
2. Open **[Add Venus Patches to Morphe](https://morphe.software/add-source?github=VenusIsJaded/Venus-Patches&name=Venus%20Patches)** and confirm the source. Alternatively, choose **Sources → + → Remote** and paste:
   ```text
   https://github.com/VenusIsJaded/Venus-Patches
   ```
3. Select the original **Discord 347.12 - Stable**, version code **347012**, in **APKM** format. Use the unmodified APKM, not an already-patched client.
4. Select the features you want; keep **Venus settings** enabled. All requested plugins are bundled locally; no remote plugin installation is needed. Let Morphe merge the splits, patch and sign the APK.
5. Install the result and open **Discord Settings → Venus**. Turn **Send audio as voice messages** on when needed.

The `main` branch's `patches-bundle.json` points to **v1.0.0**, published without the prerelease flag.

**Local import:** download `patches-1.0.0.mpp` from Releases, then choose **Sources → + → Local**. A local source does not update itself. Refresh remote sources or reimport local sources when upgrading. Repatch the **original APKM**, not a previously patched APK, and keep your existing Morphe signing key to install as an update without clearing app data.

**Signing:** a patched APK has a different signing certificate from official Discord. Android may require uninstalling official Discord first; understand the loss of local app data before doing so. Future patched updates must use the same signing key. Never share your signing key.

## Bundled plugins

- **CopyBios:** select profile bio text to copy it. Existing links and press handlers stay intact.
- **Dashless:** display-only text-channel name formatting. Does not rename channels, change messages or rewrite all React Native Views.
- **FavouriteAnything:** adds favourite support for images and videos in the media viewer and provides cached Discord-hosted video thumbnails. Favourites continue to use Discord's existing storage. External video hosts may not provide image thumbnails; signed CDN URLs can still expire under Discord's normal rules.
- **FreeNitro:** combines the requested Freemoji and FreeStickers behaviors. **Plugins → FreeNitro** contains independent **Free emojis** and **Free stickers** switches, plus compact links and an always-use-links option.

FreeNitro shares **links**, not genuine paid/native emoji or sticker entitlements. Existing usable items stay native unless forced. Channel permissions, Discord's message-length limits and other server restrictions still apply. Code spans, escaped emoji tokens, unknown items and unrelated invalid-emoji diagnostics are retained.

PNG, APNG and GIF stickers use Discord's CDN only. **APNG previews may be static; Lottie stickers are not converted.** There is no Ezgif upload or downloaded converter. Mixed supported sticker sends preserve existing text, native stickers and reply options in one send. Unsupported/unknown items fall back to Discord's original behavior without being silently dropped.

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
- At most **23 inspected Metro factories** are wrapped when all patches are selected, including the exact RN environment initializer. Unselected plugin modules are not wrapped. Feature hooks activate only after that initializer successfully returns. Unrelated factories pass through unchanged; no eager module scans, polling timers, startup network requests or root component wrapper.
- The feature code is included in the patched APK. No Vendetta/Revenge runtime, downloaded JavaScript, analytics or account-token handling.
- Switches are stored in `venus-patches.json` in Discord's private documents directory. Failed persistence is reported in the menu; switches still work for the session.

## Compatibility and integration points

The patches refuse a different embedded JavaScript bundle, even if its displayed version happens to match. The inspected Hermes asset's SHA-256 is:

```text
834bb2c88a7d8e508039e11be90a2a09f9f87017fdceef1999cf099933a6be35
```

| Integration | Inspected location |
| --- | --- |
| Bundled runtime | Guarded prelude in the HBC98 global entry; one main bundle load, with no injected private native loader call |
| Environment readiness | `setUpDefaltReactNativeEnvironment`, Metro module `120`; activate feature hooks only after successful outermost initialization |
| Native voice bridge | `FileModule.getSize(String, Promise)`—private `venus-voice-v1:` requests dispatch to the extension; normal sizes fall through |
| React / React Native | Metro modules `19` / `17` |
| Native settings registry | `SETTING_RENDERER_CONFIG`, module `14892`; adds stable route/toggle definitions |
| Native settings section/pages | `createList`, module `11754`; `SettingsList`, module `14993` |
| CopyBios / Dashless | `BioText`, module `11503`; `useChannelName`, module `4941` |
| FavouriteAnything | Media-viewer favourite button `13288`, actions `10661`, mobile favourites `10664` |
| FreeNitro | Stores `1372`, `2041`, `5708`, `5751`; capabilities `4446`; sticker rules `7611`; default message-action singleton `7730` |
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

Output: `patches/build/libs/patches-1.0.0.mpp` and `SHA256SUMS`. `patches-list.json` is generated from the actual compiled patch objects, not maintained as a guessed feature list.

Runtime regression tests can also be run independently:

```bash
node --test tests/runtime.test.cjs
```

`tests/native/PcmToolsTest.kt` checks generated PCM signals, durations, sample rates, downmixing, waveform amplitude and chunk invariance. `tests/native/VerifyApk.kt` forbids injected private native startup calls and a second main bundle load, and checks extension method/field/type linkage, the guarded HBC98 prelude, original global-instruction identity, bytecode footer, ordinary-size bypass and APK signature. These checks do **not** simulate physical Android codecs or Discord's servers.

The new startup path removes the native private-loader call **entirely**, rather than changing its opcode again. A separate main bundle load can mark RN ready and flush queued calls before Discord initializes. Venus instead inserts a fail-open prelude into the pinned HBC98 global entry, retaining all original global instructions and other tables, and activates feature hooks only after the real RN environment initializer returns. Prelude failure falls through to Discord instead of becoming a fatal bootstrap exception. Runtime tests cover deferred, failed and reentrant setup. The prior Kotlin helper/singleton ABI fixes remain in place.

`tests/native/HbcPreludeTest.kt` checks relocation, original-byte preservation, footer integrity and refusal of a different format. `tests/hermes-startup.js` isolates the APK's **actual** RN environment initializer using mocked native services; it does not execute Discord's account/network code or replace a device launch test.

### Device acceptance checklist

Before treating runtime compatibility as device-verified, check on a real device:
- Discord launches, Settings → Venus → General/Plugins opens, back navigation and light/dark themes work, switches persist after restarting, and disabled features remain inactive.
- Bio selection and links, text channel labels, image/video favourites and video previews behave correctly.
- FreeNitro switches work independently; local/native, external and animated media, replies, mixed stickers, APNG, unsupported Lottie and channel permission failures behave safely.
- Picker badges work while scrolling, on zero-byte files and on denied content URIs without blocking taps.
- MP3, AAC/M4A, WAV, FLAC and Ogg/Opus upload as playable native-looking voice messages with plausible duration and waveform.
- Cancelling conversion, low storage, unsupported formats, mixed messages and normal recorded voice messages behave safely.

## Credits and licensing

Inspired by [Martinz64's FileSizeOnPicker](https://martinz64.github.io/vendetta-plugins/FileSizeOnPicker/) ([source](https://github.com/Martinz64/vendetta-plugins), Unlicense) and [shipwr3ckd/siguma's Custom Voice Messages](https://shipwr3ckd.github.io/revengeplugin/customVoiceMessages/) ([source](https://github.com/shipwr3ckd/revengeplugin), CC0). The runtime and native conversion are independent implementations for the inspected Discord build, not unmodified plugin bundles.

The new bundled features are inspired by [CopyBios](https://shipwr3ckd.github.io/revengeplugin/CopyBios/), [Dashless](https://awesomegamergame.github.io/bunny-plugins/dashless/), [FavouriteAnything](https://theunrealzaka.github.io/FavouriteAnything/favouriteanything/), [Freemoji](https://rico040.github.io/bunny-plugins/freemoji/) and [FreeStickers](https://aliernfrog.github.io/vd-plugins/FreeStickers/). Native settings integration follows the registry/list pattern used by [Revenge](https://github.com/revenge-mod/revenge). Source attribution is retained here, not displayed as author rows in the app.

Built against the [official Morphe patcher and template](https://github.com/MorpheApp/morphe-patches-template). See Morphe's [patch sources guide](https://github.com/MorpheApp/morphe-manager/blob/main/docs/patch-sources.md) and [development documentation](https://github.com/MorpheApp/morphe-patcher/tree/main/docs).

Venus Patches is licensed under [GPL-3.0](LICENSE), with the upstream branding notice retained in [NOTICE](NOTICE). This project is not affiliated with Discord or Morphe. Releases contain patches only, not Discord APKs. Use modified clients at your own risk and review Discord's terms.
