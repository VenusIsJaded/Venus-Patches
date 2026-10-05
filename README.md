# Venus Patches

Small, bundled Discord tools for **[Morphe](https://morphe.software)**. They're built into the patched APK: there's no remote plugin loader, downloaded JavaScript or analytics.

[**Add to Morphe**](https://morphe.software/add-source?github=VenusIsJaded/Venus-Patches&name=Venus%20Patches) · [Downloads](https://github.com/VenusIsJaded/Venus-Patches/releases) · [Changelog](CHANGELOG.md) · [Report a problem](https://github.com/VenusIsJaded/Venus-Patches/issues)

**Target:** Discord **347.12 - Stable** (version code `347012`), original **APKM**.

## Features

| Feature | What it does | Default |
| --- | --- | --- |
| **Venus settings** | Native **Settings → Venus** section with General and Plugins pages | Always on |
| **File size on picker** | Shows file sizes on media-picker thumbnails | On |
| **Custom voice messages** | Sends one audio file as a real Ogg/Opus voice message with a measured waveform | Off |
| **CopyBios** | Lets you select and copy profile bio text | On |
| **Dashless** | Shows spaces instead of dashes in channel names | On |
| **FavouriteAnything** | Lets you favourite images and videos from the media viewer | On |
| **FreeNitro** | Sends unavailable emojis and stickers as CDN links | On |
| **No typing** | Stops sending your typing indicator | On |
| **QuickDelete** | Skips the delete confirmation for messages and embeds | Off |
| **NoDelete** | Keeps deleted messages from your cache, with optional local saving | Off |
| **JumpToTop** | Adds a jump-to-first-message control to chats | On |
| **Hidden Channels** | Lists locked channels with a lock icon and a native details dialog | Off |
| **Pastelize** | Gives names and mentions stable pastel colors | On |
| **PlatformIndicators** | Shows desktop, mobile, web and console status icons | On |
| **ReviewDB** | Read, write and report user and server reviews, laid out like the original plugin (opt-in) | Off |

You can turn the bundled plugin switches on and off in **Discord Settings → Venus → Plugins** without reinstalling.

### APK-level privacy patches

These are **independent Morphe patch selections**, enabled by default in Morphe, **not Discord/Venus settings**. They do not depend on Venus settings or the bundled JavaScript plugin runtime. Hermes privacy selections independently pin loading to the packaged bundle, so cached/OTA JavaScript cannot bypass them; the shared loader guard is installed only once when combining selections. Select them before patching the original APKM; changing the selection requires patching/installing again.

| Morphe patch | Bytecode-level behavior |
| --- | --- |
| **Disable analytics** | Replaces inspected Hermes analytics track, recording, drain, immediate-upload, flush and CLIENT_TELEMETRY producers with safe return bodies. Promise callers still receive resolved Promises. |
| **Disable crash reporting** | Disables native Discord/Sentry initialization (including the Rust reporter), Sentry JavaScript transport send functions, envelopes, breadcrumbs, replay, screenshots, profiling, device-context collection, independent system-log capture and cached-crash read/write paths. |
| **Disable telemetry and touch logging** | Stops touch/view-hierarchy logging and JavaScript/native telemetry-ring initialization, collection and writes, native metric monitoring and WebSocket telemetry instrumentation. |
| **Disable advertising identifiers** | Stops Discord's separate Google advertising-ID lookup before Play services are contacted; returns the existing limited-tracking map shape. Select install-attribution protection separately for AppsFlyer. |
| **Disable install attribution** | Disables Play install-referrer lookup and inspected AppsFlyer initialization/start, event/location reporting, personal-data setters and attribution identifiers. |

**Scope:** these target the identified client reporting paths in the pinned 347.12 APKM, not every possible form of data collection. Discord still receives ordinary API/gateway traffic, account activity, messages and voice traffic; server-side logging is not preventable by these patches. Operational networking, authentication, push notifications and audio/video device selection are deliberately left alone. Existing telemetry/crash files are not erased. Attribution/deferred deep links may stop working. These patches are not a network firewall, anonymity guarantee or removal of all SDK binaries.

**Validation:** the release is compiled and checked against the supplied original APK's exact ABIs and bundle hashes. No Morphe Patcher run or patched APK is needed to build it. Device behavior and traffic capture still need validation; no zero-telemetry claim is made.

## Install

1. Install [Morphe Manager](https://github.com/MorpheApp/morphe-manager/releases).
2. Tap **[Add to Morphe](https://morphe.software/add-source?github=VenusIsJaded/Venus-Patches&name=Venus%20Patches)**, or add `https://github.com/VenusIsJaded/Venus-Patches` as a remote source.
3. Select the **original** Discord 347.12 APKM. Don't use an APK you've already patched.
4. Choose your features, keep **Venus settings** on, then patch and install.

To use a local copy instead, download `patches-<version>.mpp` from [Releases](https://github.com/VenusIsJaded/Venus-Patches/releases) and import it with **Sources → + → Local**.

> **Signing:** a patched APK isn't signed with Discord's key. You may need to uninstall official Discord first, which deletes its local data. Keep using the same Morphe signing key so future updates install over the top.

## Notes

- **Hidden Channels** only shows metadata your client already received: name, creation date, last message and last pin. It can't read hidden messages or join locked voice channels. Names the server redacted appear as *name unavailable*.
- **Voice messages** need Android 10+ and an Opus encoder. If conversion fails, Discord uploads the original file as a normal attachment.
- **NoDelete** keeps at most 512 messages that *other people* deleted, and its optional archive is capped at 8 MiB. Your own deletions, failed sends and "Only you can see this" messages still disappear normally. It only retains content that was already cached on your device.
- **ReviewDB** shows a **Reviews** card under the profile note, a **Reviews** row in the server sheet and a **Reviews** entry in the user long-press menu, like the original plugin. It contacts `manti.vendicated.dev` when a profile with reviews is shown. Sign in from **Settings → Venus → Plugins → ReviewDB** to post, delete or report (long-press a review). The ReviewDB sign-in is saved until you log out and never uses your Discord token.
- **FreeNitro** sends links, not real Nitro emojis or stickers. It doesn't convert Lottie stickers.
- The patches check the bundle hash and refuse to run on any other Discord JavaScript bundle: `834bb2c88a7d8e508039e11be90a2a09f9f87017fdceef1999cf099933a6be35`.

## Build

```bash
python3 scripts/build.py      # downloads pinned toolchains, runs tests, outputs patches/build/libs/*.mpp
node --test tests/runtime.test.cjs
# Optional read-only ABI validation during compilation (an extracted original base.apk):
VENUS_ORIGINAL_APK=/path/to/base.apk python3 scripts/build.py
```

Automated tests cover the JavaScript runtime, PCM audio conversion, privacy dependency graphs and (with the original APK) exact bytecode ABIs, native result-map shapes, bundle pinning and prelude compatibility. They don't replace testing on a real device.

## License

[GPL-3.0](LICENSE). See [NOTICE](NOTICE) for attributions.
