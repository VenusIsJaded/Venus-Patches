# What's new

Every release works with **Discord 347.12 - Stable**. Always patch the original APKM.

## 1.3.5 — Clearer patches and tidier settings

- **Patches are easier to read in Morphe.** They're grouped under **Plugins** and **Privacy**, and every description says what the patch does in plain words.
- **Venus settings are tidier.** Plugins are listed A to Z, Pastelize has its own page, and the wording is clearer throughout.
- **Settings update right away.** Changing a PlatformIndicators, ReviewDB or Pastelize option no longer needs you to leave and reopen the page or chat.
- **File sizes read correctly.** A file just under 1 MB no longer shows as *1024 KB*, and sizes use KB and MB.
- **NoDelete's maximum is safer to edit.** Clearing the box keeps your number instead of resetting it to 512, and the hint follows your theme.
- The ReviewDB send button only lights up when there's something to send.
- **Less background work.** NoDelete no longer rewrites its file for every deleted message when saving is off, logging out no longer rewrites your settings, and Hidden Channels does less work per channel.
- **Patching is a little faster,** especially on phones.

## 1.3.4 — Morphe source fix and less background work

- **Adding Venus Patches to Morphe works again.** Morphe showed *"The patch bundle could not be downloaded"* when you added this repository as a source. Importing the `.mpp` file manually wasn't affected.
- **Less work while you chat.** With Pastelize or NoDelete on, name colors and the red outline are reused instead of being worked out again for every message.
- **Less work when you open a server** with Hidden Channels on, because the channel list is read once instead of twice.
- **Fewer checks on every Discord event** and every setting lookup.
- **Patching uses less memory,** which helps when patching on phones with little RAM.

## 1.3.3 — Discord's own voice-message waveform

- **Converted voice messages look like ones recorded in Discord.** They use Discord's own waveform, so quiet audio looks quiet, loud audio looks loud, and the number of bars follows the clip's length.
- **More audio files work,** including A-law and µ-law WAVs, RF64 and streamed WAVs, and WAVs using ADPCM, GSM or MP3.
- **More files are recognised as audio,** including `.m4a`, `.opus` and `.3ga` files that some apps label as video.
- Recordings that were cut off or only partly downloaded now convert up to where they stop.
- Some AAC, Opus and Vorbis files no longer fail with *Audio format changed during decoding*.

## 1.3.2 — Server reviews in the server menu

- Hold a server and tap **Reviews** to open its reviews right inside the same menu. Tap again to close them.
- Reviews now show **Loading**, **No reviews yet**, or an error with **Retry**, so a failed load is no longer silent.

## 1.3.1 — PlatformIndicators crash fix

- Fixed the *Rendered fewer/more hooks* errors when you opened or switched chats with PlatformIndicators on.
- Server and user-menu reviews open more reliably, and give feedback when they can't open.

## 1.3.0 — PlatformIndicators in DMs and instant NoDelete outline

- PlatformIndicators icons now show in the DM list and on the DM top bar.
- The red NoDelete outline appears right away, instead of only after you reopen the chat.

## 1.2.9 — NoDelete settings and original PlatformIndicators icons

- NoDelete keeps your own deleted messages again, and has a settings page. You can choose **Save permanently** and the **maximum saved messages** (1–5000).
- PlatformIndicators uses the original plugin's icons and settings, and shows icons in more places, including VR.
- Server **Reviews** now opens when you tap it.

## 1.2.8 — Stronger privacy options

- The privacy options can't be bypassed by a cached Discord update anymore.
- Added **Disable advertising identifiers**.
- Blocks more crash-report, system-log and metrics paths.

## 1.2.7 — Privacy options

- Added **Disable analytics**, **Disable crash reporting**, **Disable telemetry and touch logging** and **Disable install attribution**. You choose them in Morphe, and they're on by default.

## 1.2.6 — ReviewDB sign-in and NoDelete fixes

- ReviewDB sign-in works and stays signed in. Reviews look and behave like the original plugin.
- NoDelete keeps messages in the right order and no longer causes errors after deleting.

## 1.2.5 — ReviewDB redesign

- Reviews use Discord's own look and follow your theme.
- Delete and report now ask before they act, and permissions match Vencord.

## 1.2.4 — New Hidden Channels popup

- Tapping a locked channel opens a native Discord dialog showing when it was created and last used.
- Fixed duplicate popups.

## 1.2.3 and earlier

- **1.2.3:** ReviewDB settings moved to their own page, and Hidden Channels shows more real names.
- **1.2.2:** ReviewDB, Hidden Channels, PlatformIndicators and NoDelete look more like the originals.
- **1.2.1:** Fixed Pastelize, ReviewDB, Hidden Channels, PlatformIndicators and NoDelete.
- **1.2.0:** Added Pastelize, PlatformIndicators and ReviewDB.
- **1.1.1:** Faster voice conversion and fewer re-renders.
- **1.1.0:** Added No typing, QuickDelete, NoDelete, JumpToTop and Hidden Channels.
- **1.0.0:** Added the **Settings → Venus** section, CopyBios, Dashless, FavouriteAnything and FreeNitro.
- **1.0.0-dev:** First previews, with picker file sizes and voice messages.
