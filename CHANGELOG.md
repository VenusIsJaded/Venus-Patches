# Changelog

All releases target **Discord 347.12 - Stable (347012)**. Patch the original APKM each time.

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
