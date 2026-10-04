# Venus Patches

Independent Discord tools for use with **Morphe**. Small, bundled patches—not a full Discord client mod or a remote plugin loader.

[Add to Morphe](https://morphe.software/add-source?github=VenusIsJaded/Venus-Patches&name=Venus%20Patches) · [Downloads](https://github.com/VenusIsJaded/Venus-Patches/releases) · [Report a problem](https://github.com/VenusIsJaded/Venus-Patches/issues)

> **Release channel: 1.2.2 (non-prerelease).** Compilation, automated regression tests and patch placement are checked separately from Android runtime behavior. Real-device launch, native settings interaction, media sharing and hardware codecs still need device validation. A successful build is not an end-to-end device test.

## 1.2.2: ReviewDB and plugin fidelity repairs

- **ReviewDB:** accepts native string and object callbacks, rebuilds the fixed auth endpoint without browser-only URL assumptions, demand-loads the native OAuth helpers and requests fresh consent. Keeps the service-supported `vendetta` protocol, session-only credentials, cancellation/account guards and a deadline covering both fetch and JSON parsing. Cards now use native groups, 36-pixel reviewer avatars, badges, dates and selectable comments, with a themed input and system-review action protection.
- **Hidden Channels:** resolves real names from received full/basic records and a bounded account-scoped session cache. Channels and categories retain names without the textual `[locked]` suffix; channel information uses a native lock icon. If Discord sends only `__hidden__`, the UI explicitly says **name unavailable**—it cannot reconstruct missing server metadata or fetch hidden messages.
- **PlatformIndicators:** adds single-user **DM headers and DM lists**, **friend/user rows** and **voice-member rows** to profiles. Uses an independently drawn outlined monitor with a stem/foot instead of the filled Screen icon; the native mobile icon is unchanged. Group/guild channel titles are not misidentified as one user's presence.
- **NoDelete:** preserves the original message content, including attachment-only messages and user-written `[Deleted]` text. Removed both the injected `[Deleted]` prefix and the deleted-notice embed; retained rows use only the red background/gutter. Copying, replies and saved snapshots are not contaminated with a deletion label.

Repatch the original Discord APKM with **patches-1.2.2.mpp**. The supplied asset hash matches the pinned build. Readable and compact runtime regressions cover these repairs; successful account OAuth, final layouts and physical Android behavior still need device validation.

### Included features

- **JumpToTop:** replaces the unstyled fixed-height fallback with Discord's themed floating navigation pill and native composer/suggestion-height hooks.
- **Hidden Channels:** fills native numeric channel buckets and gives only the mobile metadata-list factory a visibility facade. Real permission results, message fetching and navigation stay protected. Reopen/restart the guild view after enabling.
- **NoDelete:** keeps independent snapshots across new messages, cache replacement, reconnects and truncation, rather than abusing AutoMod errors. Optional **Save deleted messages** retains an account-scoped local archive across restarts. Turning saving off erases it. Limit: 512 entries / 8 MiB archive; oldest entries can be evicted. Logout clears session records. Only already-cached content is retained; media links may expire.
- **Pastelize:** stable pastel names and mentions, with optional role overrides, webhook-by-name and message-content controls.
- **PlatformIndicators:** live status-colored monitor / native phone / web / console icons on profiles, single-user DM headers/lists, friend/user rows and voice-member rows, with own-session support. Full upstream guild-member-list parity is not claimed.
- **ReviewDB:** opt-in profile panel with explicit-load reviews, native OAuth, post/update, delete-own-review and report controls. Requests go to `manti.vendicated.dev`; opening a review list shares that profile ID. ReviewDB credentials are held only for the app session, never stored in preferences. Native grouped review cards show reviewer avatars, badges and dates. Community reviews are not verified facts. Live OAuth/service interaction still needs device validation.
- **Voice formats:** direct streaming PCM WAV/RIFX (8/16/24/32-bit integer, 32/64-bit float, extensible PCM) and AIFF/AIFF-C (`NONE`, `twos`, `sowt`, `fl32`, `fl64`) decoding; Android codecs remain the fallback for compressed formats. More extension/MIME aliases, decoder-availability checks and stricter waveform validation.

Compilation and automated regressions are **not** a physical-device launch, UI, OAuth or hardware-codec test.

## What you get

| Patch | Function | Runtime default |
| --- | --- | --- |
| **File size on picker** | Adds readable local file sizes to media-picker thumbnails. | On |
| **Custom voice messages** | Converts supported local audio to Ogg/Opus, derives its actual duration and waveform, and prepares a native voice-message payload. | Off—enable explicitly |
| **CopyBios** | Makes profile bio text selectable, preserving clickable links. | On |
| **Dashless** | Displays spaces instead of dashes in text channel names. | On |
| **FavouriteAnything** | Favourites images and videos through the media viewer. | On |
| **FreeNitro** | Shares unavailable custom emojis and stickers as CDN links. | Emoji and sticker switches independently on |
| **No typing** | Suppresses outgoing typing indicators only. | On |
| **QuickDelete** | Independently skips localized message/preview confirmations. | Both off—enable explicitly |
| **NoDelete** | Retains up to 512 cached deleted messages with red-only row styling for the session. | Off—enable explicitly |
| **JumpToTop** | Adds chat and channel/forum action-sheet jump-to-start controls. | On |
| **Hidden Channels** | Displays already-received locked channel metadata without granting access. | Off—enable explicitly |
| **Venus settings** | Native Discord settings section with General, Plugins and persistent controls. | Always available |

**Open Discord Settings → Venus → General or Plugins.** The Venus section appears after the Account section using Discord's native settings rows, page navigation and themes. There is no floating button, root overlay or authors list. Switches apply without reinstalling; reopen an already-visible picker or media viewer after toggling its feature. Only patches selected in Morphe are offered. **FileSizeOnPicker and Custom voice messages are now in Plugins**, alongside the other feature switches; General contains version and preference status.

## Install

1. Install a current [Morphe Manager](https://github.com/MorpheApp/morphe-manager/releases).
2. Open **[Add Venus Patches to Morphe](https://morphe.software/add-source?github=VenusIsJaded/Venus-Patches&name=Venus%20Patches)** and confirm the source. Alternatively, choose **Sources → + → Remote** and paste:
   ```text
   https://github.com/VenusIsJaded/Venus-Patches
   ```
3. Select the original **Discord 347.12 - Stable**, version code **347012**, in **APKM** format. Use the unmodified APKM, not an already-patched client.
4. Select the features you want; keep **Venus settings** enabled. The requested feature ports are bundled locally; no remote plugin installation is needed. Let Morphe merge the splits, patch and sign the APK.
5. Install the result and open **Discord Settings → Venus**. Turn **Send audio as voice messages** on when needed.

The remote source uses `main` branch metadata to discover the published **v1.2.2** bundle; refresh the source after upgrading.

**Local import:** download `patches-1.2.2.mpp` from Releases, then choose **Sources → + → Local**. A local source does not update itself. Refresh remote sources or reimport local sources when upgrading. Repatch the **original APKM**, not a previously patched APK, and keep your existing Morphe signing key to install as an update without clearing app data.

**Signing:** a patched APK has a different signing certificate from official Discord. Android may require uninstalling official Discord first; understand the loss of local app data before doing so. Future patched updates must use the same signing key. Never share your signing key.

## Bundled plugins

- **CopyBios:** select profile bio text to copy it. Existing links and press handlers stay intact.
- **Dashless:** display-only text-channel name formatting. Does not rename channels, change messages or rewrite all React Native Views.
- **FavouriteAnything:** adds favourite support for images and videos in the media viewer and provides cached Discord-hosted video thumbnails. Favourites continue to use Discord's existing storage. External video hosts may not provide image thumbnails; signed CDN URLs can still expire under Discord's normal rules.
- **No typing:** does not send start/stop typing actions; incoming typing indicators remain stock. Switching off restores the original actions immediately.
- **QuickDelete:** separate opt-in message and embed switches. Matches exact Discord-localized confirmation text, never generic “delete” substrings; unknown dialogs keep their confirmation. Message deletion is irreversible.
- **NoDelete:** only messages already present in Discord's local message store can be retained. Bulk deletions are handled, duplicate gateway events are ignored and retained messages are visibly marked. The 512-entry limit evicts the oldest retained message; disabling removes the retained messages. Dismissing one uses local dispatch, not a second DELETE request. An opt-in account-scoped local archive is available; it does not fetch remote content or download attachments.
- **JumpToTop:** preserves Jump to Present and adds an entry point when it is absent. Uses the chat's own channel ID, not a possibly stale selected-channel singleton; channel/forum action-sheet rows reuse Discord's row component. Voice-panel dismissal controls are not repurposed.
- **Hidden Channels:** opt-in, read-only metadata already received by your client. Keeps received names, uses a native lock icon on channel information and shows an information dialog instead of navigating into a locked channel. Real permission results are never overwritten; this cannot read hidden messages or join locked voice channels. Restart/reopen a guild view after changing the switch if its native list is already mounted.
- **FreeNitro:** combines the requested Freemoji and FreeStickers behaviors. **Plugins → FreeNitro** contains independent **FreeMoji / Free emojis** and **Free stickers** switches, plus compact links and an always-use-links option.

FreeNitro shares **links**, not genuine paid/native emoji or sticker entitlements. Existing usable items stay native unless forced. Channel permissions, Discord's message-length limits and other server restrictions still apply. Code spans, escaped emoji tokens, unknown items and unrelated invalid-emoji diagnostics are retained.

PNG, APNG and GIF stickers use Discord's CDN only. **APNG previews may be static; Lottie stickers are not converted.** There is no Ezgif upload or downloaded converter. Mixed supported sticker sends preserve existing text, native stickers and reply options in one send. Unsupported/unknown items fall back to Discord's original behavior without being silently dropped.

## Voice messages: closer to native, without pretending

The reference plugin supplies a constant waveform and a fixed 60-second duration and changes the MIME label without re-encoding the audio. Venus instead implements:

- A native **streaming PCM reader or MediaExtractor → MediaCodec → Ogg MediaMuxer** conversion path.
- **48 kHz, mono, 64 kbit/s Opus** output—not a renamed MP3.
- Duration calculated from the PCM actually processed and a waveform derived from its amplitude, consumed by Discord's **native voice-attachment waveform renderer**. The inspected APK has no callable file-to-waveform generator, so measurement remains local instead of using placeholder bars.
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
- At most **four** metadata reads at once; a **256-entry** cache with LRU eviction of completed reads. In-flight reads cannot be evicted.
- Successful results expire after five minutes; failed reads after 30 seconds. Disabling clears queued work and cached results.
- Does not mutate React props or intercept touches on the size badge. Badge subscribers ignore unrelated settings and persistence notifications.

**Voice**
- One codec worker with a bounded four-job waiting queue; no decoding on the UI/JS thread.
- Streaming PCM conversion rather than holding the entire decoded recording in memory or sending base64 audio through React Native. Common 48 kHz mono PCM16 chunks use a bulk-copy path; other layouts use pre-sized output arrays instead of growing byte streams.
- Per-upload Promise reuse prevents duplicate conversions on retries. Cancelling an upload or turning the switch off cancels pending work.
- Abandoned converted outputs are pruned during subsequent conversions: at most 32 outputs retained, with six-hour expiry. Original source files are never deleted.

**New plugin ports**
- Disabled/unselected features take the stock path; no downloaded JavaScript or broad React/global-network interception. ReviewDB alone makes explicit third-party service requests.
- NoDelete retains at most 512 independent snapshots; the optional archive is limited to 8 MiB. Session snapshots survive cache resets and clear on logout.
- Hidden Channels has a 16-guild list cache and up to 4,096 received names scoped to the current account/session; native permission, name and record-reference checks invalidate stale entries. It never probes an inaccessible channel's API.
- QuickDelete resolves its two localized labels only at the confirmation boundary, preserving locale changes and stock fallbacks.
- Media wrappers preserve non-enumerable Metro module markers, React memo/forwardRef tags, symbols and property descriptors. This fixes the invalid component-object wrapping behind the reported media-viewer crash.
- FreeMoji hooks the actual default capability object and direct emoji catalog checks. Send conversion consults real eligibility, not the picker override, so non-Nitro emoji tokens become links correctly.

**Runtime**
- At most **63 inspected Metro factories** are wrapped when all patches are selected, including the exact RN environment initializer. Unselected plugin modules are not wrapped. Feature hooks activate only after that initializer successfully returns. Unrelated factories pass through unchanged; no eager module scans, polling timers, startup network requests or root component wrapper.
- The feature code is included in the patched APK. ReviewDB is the only opt-in service integration. No Vendetta/Revenge runtime, downloaded JavaScript or analytics. ReviewDB uses its own identify-only OAuth credential, not your Discord account token.
- Switches are stored in `venus-patches.json` in Discord's private documents directory. Writes are serialized with at most one latest waiting snapshot, not an unbounded Promise queue. Failed persistence is reported in the menu; switches still work for the session.

### Measuring performance responsibly

The included JVM PCM benchmark uses 2,000 chunks of 960 frames, five warm-up rounds and the median of nine measured rounds. In this Linux/Java 21 sandbox, representative before/after runs were about **39 ms → 9.5 ms** for 48 kHz mono PCM16 (roughly **4× faster for that conversion loop**). The 44.1 kHz stereo workload was around **43–45 ms**; it is **not demonstrated to be faster**. Both implementations produced matching workload checksums. Results vary with JIT compilation and load; this is not an Android codec, battery, FPS or startup benchmark.

After building, reproduce the current workload with:

```bash
java -Xmx128m -cp patches/build/pcm-tests.jar:patches/build/voice-classes.jar:work/tools/morphe.jar PcmToolsTestKt --benchmark
```

For an Android comparison, use the same device/APKM, patch selection, account, recording and signing key for each version. Measure cold launch separately from warm launch, picker scrolling separately from metadata latency, and conversion duration separately from upload time. Repeat runs without thermal throttling. **No physical-device performance measurements are claimed here.**

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
| FreeNitro | Stores `1372`, `2041`, `5708`, `5751`; default capabilities `4446` and catalog `14280`; sticker rules `7611`; default message-action singleton `7730` |
| No typing / QuickDelete | Default typing actions `12272`; native alerts `5141`, live locale `1115` |
| NoDelete | Default dispatcher `573`, MessageStore `5008`, local dismiss via message actions `7730` |
| JumpToTop | Native Jump to Present `12549`, channel/forum sheets `11207` / `10518`, message actions `7730` |
| Hidden Channels | Constants `1074` / `1085`, real permissions `4427`, directory `2096`, ChannelStore `2041`, labels `4941`, ChannelInfo `16569`, LockIcon `5345`, routing `1101` |
| PlatformIndicators | Presence `4828`, Sessions `4806`, profile `11448`, friends `11159`, DM header `13603`, DM list `16377`, voice-member row `9970` |
| ReviewDB | Profile `13382`, native modals `4645`, OAuth `9358`, rows/groups `5854` / `5936`, theme `4505` |
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

Output: `patches/build/libs/patches-1.2.2.mpp` and `SHA256SUMS`. `patches-list.json` is generated from the actual compiled patch objects, not maintained as a guessed feature list.

Verify a downloaded release before local import: place `SHA256SUMS` next to the `.mpp`, then run `sha256sum -c SHA256SUMS` on Linux (or an equivalent SHA-256 tool). The checksum detects corruption; it is not a publisher signature.

Runtime regression tests can also be run independently:

```bash
node --test tests/runtime.test.cjs
```

`tests/native/PcmToolsTest.kt` checks generated PCM signals, durations, sample rates, downmixing, waveform amplitude, chunk invariance, signed extrema, direct/sliced buffers and non-finite float rejection. `tests/native/VerifyApk.kt` forbids injected private native startup calls and a second main bundle load, and checks extension method/field/type linkage, the guarded HBC98 prelude, original global-instruction identity, bytecode footer, ordinary-size bypass and APK signature. These checks do **not** simulate physical Android codecs or Discord's servers.

The new startup path removes the native private-loader call **entirely**, rather than changing its opcode again. A separate main bundle load can mark RN ready and flush queued calls before Discord initializes. Venus instead inserts a fail-open prelude into the pinned HBC98 global entry, retaining all original global instructions and other tables, and activates feature hooks only after the real RN environment initializer returns. Prelude failure falls through to Discord instead of becoming a fatal bootstrap exception. Runtime tests cover deferred, failed and reentrant setup. The prior Kotlin helper/singleton ABI fixes remain in place.

`tests/native/HbcPreludeTest.kt` checks relocation, original-byte preservation, footer integrity and refusal of a different format. `tests/hermes-startup.js` isolates the APK's **actual** RN environment initializer using mocked native services; it does not execute Discord's account/network code or replace a device launch test.

### Device acceptance checklist

Before treating runtime compatibility as device-verified, check on a real device:
- Discord launches, Settings → Venus → General/Plugins opens, back navigation and light/dark themes work, switches persist after restarting, and disabled features remain inactive.
- Bio selection and links, text channel labels, image/video favourites and video previews behave correctly.
- FreeNitro switches work independently; local/native, external and animated media, replies, mixed stickers, APNG, unsupported Lottie and channel permission failures behave safely.
- No typing restores outgoing status when disabled; QuickDelete only skips enabled message/embed confirmations in the current locale; NoDelete marks/dismisses cached deletions and handles bulk events; JumpToTop works in DMs, guilds and forum/channel sheets; Hidden Channels shows only metadata and never admits locked chat/voice access.
- Picker badges work while scrolling, on zero-byte files and on denied content URIs without blocking taps.
- MP3, AAC/M4A, WAV, FLAC and Ogg/Opus upload as playable native-looking voice messages with plausible duration and waveform.
- Cancelling conversion, low storage, unsupported formats, mixed messages and normal recorded voice messages behave safely.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Morphe still shows an older version | Refresh the remote source or import `patches-1.2.2.mpp` again. Repatch the original APKM. |
| Unsupported JavaScript bundle | Confirm Discord 347.12 / 347012 and the exact embedded bundle hash above. Do not bypass the guard. |
| Preferences say session-only/read failed | Inspect Venus → General; use valid stored settings, check available storage and restart. Switches remain usable for the session. |
| No size badge | Only local `content://` and `file://` URIs are queried. Invalid/denied metadata hides the badge; retry after the 30-second failure expiry or reopen the picker. |
| Audio is sent as a normal file | Enable Custom voice messages, use one supported audio attachment with no text, and check API 29+, codec availability and the reported conversion error. |
| Install fails with signature mismatch | Use the same Morphe signing key as your previous patched installation. Do not uninstall until you understand the local-data loss. |
| Crash or rendering regression | Disable the affected feature, retry with only Venus settings selected, and report device/API level, patch version, selected features and a redacted stack trace. Never include tokens or private message content. |

Releases distribute only `.mpp` patches and checksums—not your Discord APKM, patched APK, account data or signing keys. Automated checks cannot guarantee that every upstream Discord bug is fixed.

## Credits and licensing

Inspired by [Martinz64's FileSizeOnPicker](https://martinz64.github.io/vendetta-plugins/FileSizeOnPicker/) ([source](https://github.com/Martinz64/vendetta-plugins), Unlicense) and [shipwr3ckd/siguma's Custom Voice Messages](https://shipwr3ckd.github.io/revengeplugin/customVoiceMessages/) ([source](https://github.com/shipwr3ckd/revengeplugin), CC0). The runtime and native conversion are independent implementations for the inspected Discord build, not unmodified plugin bundles.

The new bundled features are inspired by [CopyBios](https://shipwr3ckd.github.io/revengeplugin/CopyBios/), [Dashless](https://awesomegamergame.github.io/bunny-plugins/dashless/), [FavouriteAnything](https://theunrealzaka.github.io/FavouriteAnything/favouriteanything/), [Freemoji](https://rico040.github.io/bunny-plugins/freemoji/) and [FreeStickers](https://aliernfrog.github.io/vd-plugins/FreeStickers/). The five new ports are independently implemented from the requested [No typing](https://redstonekasi.github.io/vendetta-plugins/no-typing/), [QuickDelete](https://purple-eyez.github.io/RevengePlugins/QuickDelete/), [NoDelete](https://meqativ.github.io/dumsane/NoDelete/), [JumpToTop](https://tralwdwd.github.io/plugins/JumpToTop/) and [Hidden Channels](https://lioncat6.github.io/revenge-plugins/hidden-channels/) behaviors, not bundled unmodified third-party scripts. Native settings integration follows the registry/list pattern used by [Revenge](https://github.com/revenge-mod/revenge). Source attribution is retained here, not displayed as author rows in the app.

Built against the [official Morphe patcher and template](https://github.com/MorpheApp/morphe-patches-template). See Morphe's [patch sources guide](https://github.com/MorpheApp/morphe-manager/blob/main/docs/patch-sources.md) and [development documentation](https://github.com/MorpheApp/morphe-patcher/tree/main/docs).

Venus Patches is licensed under [GPL-3.0](LICENSE), with the upstream branding notice retained in [NOTICE](NOTICE). This project is not affiliated with Discord or Morphe. Releases contain patches only, not Discord APKs. Use modified clients at your own risk and review Discord's terms.

Requested ports are independent implementations inspired by [Pastelize](https://vd-plugins.github.io/proxy/cynosphere.github.io/VendettaPlugins/Pastelize/), [PlatformIndicators](https://martinz64.github.io/vendetta-plugins/PlatformIndicators/) and [ReviewDB](https://janisslsm.github.io/vdplugins/ReviewDB). No remote plugin scripts are shipped. PlatformIndicators now covers profiles, single-user DM headers/lists, friend/user rows and voice-member rows. This is an independently implemented port; complete upstream guild-member-list parity is not claimed.
