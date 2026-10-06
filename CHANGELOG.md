# Changelog

All releases target **Discord 347.12 - Stable (347012)**. Patch the original APKM each time.

## 1.3.1 — PlatformIndicators hook stability and native server Reviews

### PlatformIndicators
- Fixes both **Rendered fewer hooks than expected** and **Rendered more hooks than during the previous render** when opening or switching chats. DM header and DM row fallback placement is now hook-free; settings subscriptions run once regardless of the layout.
- Keeps the DM-list and header icon placements added in 1.3.0, including immutable props and memoized components.

### ReviewDB
- Opens bundled server and user-menu Reviews through Discord 347.12's named native `showActionSheet` helper, rather than a detached lazy-import Promise chain. Reviews stack above the existing server sheet.
- Retries missing UI exports instead of caching an incomplete lookup permanently. Unavailable/opening failures provide feedback, and a stale button does nothing after ReviewDB is disabled.
- Closing Reviews targets its own sheet key instead of an unspecified sheet. Late theme availability cannot add hooks to an already-mounted review input.

### Validation
- Reproduced both reported hook errors with a real React renderer on the old runtime; the fixed plain and memoized DM components survive primary/fallback/loading transitions and settings toggles.
- Added server sheet opening, review fetching, keyed close, missing-export retry and error regressions. Source and packaged compact runtime are tested, with read-only native ABI/privacy validation against the supplied original APK.
- Built for the original **347.12 APKM**. These automated checks do not replace Android device testing.

## 1.3.0 — PlatformIndicators in DMs and instant NoDelete outline

### PlatformIndicators
- **DM list icons show up.** Discord 347.12's DM list row puts the name inside `UsernameWithEffects`, next to the server tag, so icons never appeared. They now sit on the right of the row, next to the muted/favorite icon and above the timestamp, away from the server tag.
- **DM top bar icons show up.** The DM header draws its title in a separate `ChannelTitle` component. Icons now appear right after the name, before the arrow.

### NoDelete
- **The red outline appears right away.** Discord's chat renderer (`ChatManager.determineChangeType`) deep-compares message records and skips rows that look unchanged. Because of that, a deleted message only turned red after you left the chat and came back. Kept records now carry a hidden marker, so the row redraws immediately for anyone's deletions. Message content is untouched.

## 1.2.9 — NoDelete, PlatformIndicators and ReviewDB fixes

### NoDelete
- **Your own deletions are kept again.** Messages you delete now keep the same red outline as everyone else's, like the original plugin. 1.2.6 deliberately dropped them; that change is reverted. Failed or unsent messages and "Only you can see this" messages still disappear.
- **New NoDelete settings page** (Settings → Venus → Plugins → NoDelete) with three options:
  - **Enable NoDelete**.
  - **Save permanently.** On: kept messages survive restarts, stored locally for your account. Off: they are kept until Discord restarts, and the saved archive is erased.
  - **Maximum saved messages.** Type a number from 1 to 5000 (default 512). Lowering it removes the oldest kept messages right away.
- The local archive cap is raised to 32 MiB to fit larger maximums.

### PlatformIndicators
- **Original icons.** Uses the original plugin's tinted desktop, mobile, web, console and VR glyphs. The hand-drawn desktop monitor is gone.
- **More places.** Adds icons to the users in a profile's voice-channel list and shows VR clients. Clients appear in the order Discord reports them.
- **Original settings.** Show icons on the DM top bar, the users and DMs list, and user profiles. **Hide mobile status from the normal indicator** (on by default) shows the plain status dot instead of Discord's phone badge on avatars.

### ReviewDB
- **Server Reviews opens.** Long-pressing a server and tapping **Reviews** did nothing. Discord 347.12's sheet opener called our reviews loader as a function and failed silently. Reviews now open in a sheet stacked above the server sheet.

### Build
- Raised the prelude size limit (now 118,000 build / 120,000 injector) to fit the bundled icons. No Morphe Patcher run; validated against the original APK's bundle.

## 1.2.8 — Deeper privacy audit

- **Fixed a cached/OTA bundle bypass:** analytics, crash-reporting and telemetry patches now independently pin Discord's packaged Hermes bundle. They still do not require Venus settings. A shared dependency prevents duplicate loader hooks when settings and privacy are combined.
- **Closed an independent metrics path:** Disable analytics now also disables MonitoringAgent increment/distribution collection and its `/metrics/v2` uploader, preventing an unbounded queue when uploads are blocked.
- **Fixed native profiling return contracts:** disabled Sentry start/stop profiling return safe maps (`started: false` / empty map), rather than null objects that JavaScript immediately dereferences.
- Added **Disable advertising identifiers**, an independent default-on Morphe patch for Discord's separate Google advertising-ID bridge. It skips Play-services lookup and resolves the existing limited-tracking map schema. AppsFlyer remains covered by Disable install attribution.
- Closed independent system-log capture and cached crash-report collection paths. Disabled crash-history/system-log callbacks complete exactly once with `false`, `null` or an empty string instead of hanging or reading old diagnostics. Direct native exception/breadcrumb and WebRTC-reporting guards preserve operational error-string behavior.
- Stops native metric-monitor events, libdiscore metrics collection and WebSocket telemetry instrumentation without replacing operational WebSocket connections.
- Also disables independent system-log capture, crash persistence/read callbacks, native metric monitoring and WebSocket telemetry instrumentation while completing disabled callbacks safely. Existing diagnostic files are not erased.
- Strengthened HBC expanded-header/footer checks, all 64 privacy/settings dependency selections, native stub result-shape and host-ABI tests, and combined privacy/prelude tests. The audit covers 17 pinned Hermes bodies and 80 native targets.
- No Morphe Patcher run or patched APK. Device/network testing remains required; server-side logging and all possible collection are not claimed to be eliminated.

## 1.2.7 — APK-level privacy patches

- Added four independently selectable Morphe patches: **Disable analytics**, **Disable crash reporting**, **Disable telemetry and touch logging**, and **Disable install attribution**. They default on in Morphe, have no Discord/Venus settings switch and work without Venus settings.
- Analytics and JavaScript Sentry/telemetry guards replace 12 inspected, hash-pinned Hermes function bodies. Native guards target 61 exact concrete method signatures, preserving safe return values, resolving bridge Promises and completing nullable AppsFlyer request callbacks.
- Blocks the identified analytics upload/queue paths, Sentry initialization and transport sends, touch/view-hierarchy logging, telemetry-ring writes, install referrer and AppsFlyer reporting/identifier paths.
- Existing plugins are unchanged. Normal Discord networking, authentication, push and voice/video device APIs are not globally disabled. Existing local diagnostic files are not erased; attribution/deferred deep links may stop working.
- Added in-memory HBC selection-combination tests and detached native stub assembly/ABI checks against the original base APK. Compiled the `.mpp` without invoking Morphe Patcher or producing a patched Discord APK. Device/network testing is still required; server-side activity logging cannot be blocked.

## 1.2.6 — ReviewDB sign-in and NoDelete fixes

### ReviewDB
- **Sign-in works.** Tapping **Authorize** used to send you back to "Authenticate with ReviewDB" every time. Discord 347.12 closes the authorization screen *before* it hands over the code, and the plugin treated that as a cancel. It now waits for the code, exchanges it, and shows a "Successfully authenticated" toast.
- **Stays signed in.** The ReviewDB sign-in is saved and survives restarts and turning the plugin off, like the original. **Log out of ReviewDB** removes it.
- **Original layout and placement.** Profiles show a **Reviews** card directly under the note, with avatar, name, badges and date on each review and the text field and round send button at the bottom. The server sheet shows a single **Reviews** row that opens the reviews in a sheet, and long-pressing a user adds a **Reviews** menu entry.
- **Original actions.** Long-press a review for **Copy Text**, **Delete Review** and **Report Review**. Admins, review authors and the profile owner can delete.
- **Original settings.** The settings page has Authentication and Settings groups, with **Use profile-themed send button** and **Show Warning**.

### NoDelete
- **Your own deletions disappear again.** Deleting your own message, a failed or unsent message, or an "Only you can see this" message no longer leaves it stuck in red.
- **No more errors after deleting.** Discord's delete action no longer gets an empty result when a deletion is kept.
- **Rows stay in order.** Kept messages no longer appear above history that hasn't loaded yet, or after an older jump.
- **Faster.** Kept messages are indexed per channel, chats aren't re-merged on every unrelated event, and saving the archive is batched instead of rewritten once per deletion.

## 1.2.5 — ReviewDB redesign

- **Native look.** Reviews now use Discord's own components: Card, Text, Button, TextArea and toasts. They follow light, dark and AMOLED themes with no hardcoded colors.
- **Cleaner reviews.** Each review shows the avatar, name, badges, a readable date and selectable text. ReviewDB system notices are highlighted.
- **Simpler header.** A single "Reviews" or "Server reviews" row shows the real total from ReviewDB.
- **Better writing flow.** The text field caps reviews at 1,000 characters and shows a live counter. It switches to "Update review" when you've already posted one, and a toast confirms posting, deleting and reporting.
- **Discord-style confirmations.** Delete and report ask first, using Discord's native dialog.
- **Correct permissions.** These now match Vencord: you can delete reviews you wrote, plus any review on your own profile. You can report other people's reviews but not your own. System notices have no actions.
- **Safer credentials.** The ReviewDB token goes in the `Authorization` header, as in current Vencord, instead of in request bodies. Loading reviews never sends it.
- **Clearer messages.** Timeouts now say "ReviewDB took too long to respond" instead of always mentioning authorization. The settings text is shorter.

## 1.2.4 — Native Hidden Channels dialog

- **Redesigned the Hidden Channels popup.** Tapping a locked channel now opens Discord's own alert dialog, the same one as "Delete Message." The new dialog has a blurred backdrop, a themed card, native buttons and theme-aware text, so it no longer turns the whole screen black.
- **Clearer details.** The dialog is titled "Locked channel" or "Locked voice channel." It shows when the channel was created and when its last message and last pin were posted, each as a precise relative time plus the exact date.
- **Fixed duplicate popups.** One tap could open two stacked dialogs. Now only one dialog per channel can be open at a time.
- **Lighter startup.** Hidden Channels no longer hooks the modal and theme modules at launch. The dialog loads only when you tap.
- **More channel records.** Discord now builds real records for locked channels, so their names show up more often. Messages and voice remain blocked.

## 1.2.3 — ReviewDB sign-in and channel names

- Fixed ReviewDB sign-in failing because Discord closes the OAuth screen before the token exchange finishes.
- Moved ReviewDB enable, sign-in and logout into **Settings → Venus → Plugins → ReviewDB**.
- Reviews now appear on every profile layout and in the server action sheet.
- Hidden Channels resolves names from more sources (full, basic and gateway data) and keeps Discord's own formatting.

## 1.2.2 — ReviewDB and plugin fidelity

- ReviewDB: more reliable OAuth, request timeouts, native review cards with avatars, badges and dates.
- Hidden Channels: real names on channels and categories, native lock icons, and no `[locked]` suffix.
- PlatformIndicators: added to DM headers, DM lists, friend rows and voice members.
- NoDelete: keeps the original message text and marks deleted rows in red only.

## 1.2.1 — Five plugin repairs

- Fixed Pastelize colors, ReviewDB sign-in, Hidden Channels "No Access" labels, PlatformIndicators icons and NoDelete retention.

## 1.2.0 — Chat fixes, new ports and voice formats

- Added Pastelize, PlatformIndicators and ReviewDB.
- JumpToTop uses Discord's themed floating pill.
- NoDelete gained an optional local archive (512 messages, 8 MiB).
- Voice messages can now decode WAV, RIFX and AIFF files directly.

## 1.1.1 — Performance and reliability

- Mono 48 kHz voice conversion is about 4× faster in JVM benchmarks.
- Fewer re-renders, coalesced settings writes and a smaller runtime (about 29% fewer characters).
- Fixed several edge cases in file sizes, voice cancellation and codec cleanup.

## 1.1.0 — Media fixes and five new plugins

- Added No typing, QuickDelete, NoDelete, JumpToTop and Hidden Channels.
- Fixed a media-viewer crash and FreeMoji detection.

## 1.0.0 — Native settings

- Replaced the floating button with a native **Settings → Venus** section.
- Added CopyBios, Dashless, FavouriteAnything and FreeNitro.

## 1.0.0-dev.1 to dev.3 — Previews

- First experimental builds with picker file sizes and Ogg/Opus voice messages.
- Fixed startup crashes on Hermes: a single-load prelude, private native call ABI and eval-scope captures.
