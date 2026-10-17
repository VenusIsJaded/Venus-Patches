## [1.15.0](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.14.0...v1.15.0) (2026-10-17)

### ✨ New Features

* **Discord - Venus settings:** Add Catalan (Català) as a settings language, bringing Venus settings to 31 languages

### 🔧 Improvements

* **Discord - Venus settings:** Hand-review and refine all 30 translated settings languages for more natural, idiomatic wording
* **Discord - Venus settings:** Remove redundant top status cards on option pages when a feature is already on and its preview or options speak for themselves
* **Discord - Venus settings:** Channel, DM and server headers in previews show Discord's title chevron and round action buttons
* **Discord - Venus settings:** Message bars in previews show Discord's gift button when Hide the gift button is off, and tapping the emoji button opens the expression picker
* **Discord - Venus settings:** Long-press message menus in previews show Discord's quick reaction row above the actions card
* **Discord - Double-tap to reply:** The preview shows the reply line above your message, the @ ON mention switch in the reply bar and Discord's blue target highlight
* **Discord - Translate messages:** The long-press menu in the preview places Translate and Show original right below Copy Text, matching Discord's real message menu
* **Discord - Show device indicators:** The preview is directly interactive with the DM, Members and Profile switcher and Change Alex's devices button, and the profile shows Discord's avatar cutout and Message, Call and Video buttons
* **Discord - Send Nitro stickers and emojis as links:** The expression picker in the preview matches Discord's real Emojis, GIFs and Stickers sheet with search bar, server header, unlocked Nitro items without a lock icon and bottom category bar, opened from the message bar's emoji button
* **Discord - Message highlights:** The preview shows a static chat picture with your mention reply and kept deleted message that updates live and glows only the highlight you just changed
* **Discord - Keep deleted messages:** The preview shows a static chat picture with an edited message's history and an outlined deleted message that updates live as you flip Show edit history
* **Discord - Pastel name colors:** The preview shows a static chat picture that updates live as you flip Replace role colors or Color message text

## [1.14.0](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.13.0...v1.14.0) (2026-10-17)

### ✨ New Features

* **Discord - Show hidden channels:** Add an option to turn off the locked-channel menu, so tapping a locked channel does nothing ([#62](https://github.com/VenusIsJaded/Venus-Patches/issues/62))

### 🐛 Bug Fixes

* **Discord - Account switcher:** Fixed every added account disappearing after Discord was closed in the background for a while and reopened ([#63](https://github.com/VenusIsJaded/Venus-Patches/issues/63))
* **Discord - Show hidden channels:** Fixed scrolling past a locked channel showing its menu even though you never tapped it ([#62](https://github.com/VenusIsJaded/Venus-Patches/issues/62))
* **Discord - Show hidden channels:** Fixed opening a server or Discord showing the menu of a locked channel you had last tapped there
* **Discord - Show hidden channels:** Fixed a locked channel listed above the real ones being picked as the server's first channel
* **Discord - Show hidden channels:** Fixed locked channels in the channel list showing an extra large lock beside Discord's own lock icon

### 🔧 Improvements

* **Discord - Venus settings:** Option pages rise into place group by group, and switches and choices ease the page into its new layout
* **Discord - Venus settings:** Segmented choices slide to the one you pick, and picked colors, themes and accounts pop in a check mark
* **Discord - Venus settings:** Motion follows Android's Remove animations setting and stays off when it's on
* **Discord - Venus settings:** About is a designed page with the version, a features-on bar, a count per group and a working status
* **Discord - Venus settings:** The Features entry shows how many features are on, like "5 of 31 turned on"
* **Discord - Complete Quests automatically:** The status card shows the running Quest's progress bar and about how many minutes are left
* **Discord - Venus settings:** Every preview looks like the part of Discord it changes, with its header, message bar and menus
* **Discord - Venus settings:** Previews can be watched like a short video, with readable steps, a progress bar, pause and start over
* **Discord - Venus settings:** Try it on a preview shows a tip with what to tap next until you've tried everything
* **Discord - Double-tap to reply:** The preview shows a double-tap reply, then triple-tapping your message away, or editing it
* **Discord - Show hidden channels:** The preview is a server's channel list with Discord's locked-channel icon; a tap opens the same details dialog as in chat
* **Discord - Send Nitro stickers and emojis as links:** The preview sends Discord's own Wumpus emoji and sticker from the picker, never your servers' emojis or stickers
* **Discord - Show device indicators:** The preview shows the icons in a DM, the member list and a profile, following your switches
* **Discord - Message highlights:** The preview glows the highlight you just changed, like a new mention arriving; tap a highlighted message to see it again
* **Discord - Keep deleted messages:** The preview shows edits keeping their old text and a deleted message staying, outlined
* **Discord - Pastel name colors:** The preview shows names filling in with their colors, with New people for more
* **Discord - Translate messages:** The preview follows Automatically or Only when you ask, with Discord's message menu, and Try it switches to the original and back
* **Discord - Read all button:** The button shows a check for a moment after it marks something as read
* **Discord - Keep deleted messages:** How many deleted messages to keep is a choice of 100, 512, 1000 or 5000 instead of a number to type
* **Discord - Custom themes:** One link box with a Paste or Install button replaces the separate Install and Paste rows
* **Discord - Custom themes:** Theme rows no longer repeat "Tap to apply"; the one in use says so
* **Discord - Account switcher:** Removed the Open quick switcher row; tap your active account to open the same sheet
* **Discord - User and server reviews:** The Account group shows only the action you can take now, Sign in or Sign out, not a greyed-out opposite

## [1.13.0](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.12.0...v1.13.0) (2026-10-16)

### ✨ New Features

* **Discord:** Add `Message highlights` patch ([#60](https://github.com/VenusIsJaded/Venus-Patches/issues/60))
* **Discord - Message highlights:** Change the left bar width and highlight colors for replies, mentions and deleted messages, with a live chat preview and any-color picker ([#60](https://github.com/VenusIsJaded/Venus-Patches/issues/60))
* **Discord:** Add `Custom themes` patch ([#57](https://github.com/VenusIsJaded/Venus-Patches/issues/57))
* **Discord - Custom themes:** Install Revenge and Vendetta color themes from a link, switch between them and show their chat wallpaper ([#57](https://github.com/VenusIsJaded/Venus-Patches/issues/57))

### 🐛 Bug Fixes

* **Discord - Venus button on profile bar:** Fixed the first tap after restarting opening Account settings or a black screen instead of Venus settings ([#58](https://github.com/VenusIsJaded/Venus-Patches/issues/58))
* **Discord - Account switcher:** Fixed adding a sixth account removing one of your saved accounts instead of keeping up to 50 ([#59](https://github.com/VenusIsJaded/Venus-Patches/issues/59))
* **Discord - Spaces in channel names:** Fixed forum, media, directory and app channels and channel mentions still showing dashes instead of spaces
* **Discord - Double-tap to reply:** Fixed double-tapping replying in channels where you can't reply, and Discord still showing its double-tap to react tips
* **Discord - Send long messages:** Fixed turning it off not bringing back Discord's real 2000 or 4000 character limit until restart
* **Discord - Send long messages:** Fixed long messages losing text-to-speech and mention settings, and waiting out slowmode even when you can bypass it
* **Discord - Read all button:** Fixed servers you're previewing, guest servers, servers with unread events and DMs past the first 20 staying unread
* **Discord - User activity notifications:** Fixed no notice showing when a watched person came online for the first time since Discord opened
* **Discord - Send audio as voice messages:** Fixed audio sent in announcement channels or as a scheduled message not becoming a voice message

### 🔧 Improvements

* **Discord - Venus settings:** Redesign every option page with a status card, Discord's row icons and live previews of what each feature changes
* **Discord - Venus settings:** Show every Venus pop-up message with an icon, like Discord's own, and translate every new settings text
* **Discord - User activity notifications:** Pick All friends or People I pick with one switch, with avatars and status dots for each person
* **Discord - User and server reviews:** Retry a failed load with a real button, and say Signed in to ReviewDB after signing in

### ⚡ Performance Improvements

* **Discord - Pastel name colors:** Skip copying a message on every scroll frame when its colors didn't change
* **Discord - Send audio as voice messages:** Convert audio with less memory and without waiting between decoder steps

## [1.12.0](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.11.0...v1.12.0) (2026-10-14)

### ✨ New Features

* **Discord:** Add `Unlock app icons` patch
* **Discord - Unlock app icons:** Use any Discord app icon in Settings without Nitro, and hide the Nitro upsell button
* **Discord:** Add `Account switcher` patch
* **Discord - Account switcher:** Switch between up to 50 Discord accounts from a profile bar button or Venus settings
* **Discord:** Add `User activity notifications` patch
* **Discord - User activity notifications:** Show a notice when chosen friends or user IDs change status, start typing or send a message, inside or outside Discord

### 🐛 Bug Fixes

* **Discord - Complete Quests automatically:** Fixed Quests stopping progress when you leave Discord by keeping the Gateway connection alive in the background
* **Discord - Disable analytics:** Fixed session heartbeats, search tracking, impression events, and network action logs still being recorded and sent
* **Discord - Disable telemetry and touch logging:** Fixed screen smoothness (jank) session threads, startup TTI markers, and React component span timers still running on every screen change
* **Discord - Disable crash reporting:** Fixed Sentry breadcrumbs, crash tags, crash persistence, and JS exception reports still being recorded

### 🔧 Improvements

* **Discord - Disable analytics:** Expand analytics blocking to 48 Hermes bytecode functions, including ad/Quest tracking and voice stats
* **Discord - Disable telemetry and touch logging:** Expand telemetry blocking to 40 Hermes bytecode functions and 46 native Android methods
* **Discord - Disable crash reporting:** Expand crash reporting blocking to 16 Hermes bytecode functions and 45 native Sentry and CrashReporting methods

### ⚡ Performance Improvements

* **Discord:** Skip background over-the-air bundle update checks and downloads on launch since Venus always runs the packaged bundle
* **Discord:** Build the startup bytecode prelude from multi-character strings and dense array ops, cutting startup prelude instructions by two-thirds
* **Discord - Show hidden channels:** Cache PermissionStore's original permission check once instead of looking it up on every channel check
* **Discord - Use your phone's font:** Skip parsing the settings JSON on startup when the font switch is off
* **Discord - Use your phone's emojis:** Skip parsing the settings JSON on startup when the emoji switch is off

## [1.11.0](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.10.0...v1.11.0) (2026-10-13)

### ✨ New Features

* **Discord - Venus settings:** Venus settings in 30 languages, including Russian ([#50](https://github.com/VenusIsJaded/Venus-Patches/issues/50))
* **Discord - Venus settings:** Pick the settings language in Language, or follow Discord's
* **Discord - Translate messages:** Translate only the messages you pick, from the hold menu ([#50](https://github.com/VenusIsJaded/Venus-Patches/issues/50))
* **Discord - Translate messages:** Hold a message to show its original, or translate your own

### 🐛 Bug Fixes

* **Discord - Translate messages:** Fixed replies showing the quoted message untranslated instead of translating it like chat messages ([#51](https://github.com/VenusIsJaded/Venus-Patches/issues/51))

### 🔧 Improvements

* **Discord - Translate messages:** "Translated from" names the language in the settings language

## [1.10.0](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.9.0...v1.10.0) (2026-10-13)

### ✨ New Features

* **Discord - Venus settings:** Every feature has its own Discord icon in the list
* **Discord - Venus settings:** About shows how many features are on, plus What's new and help links
* **Discord - Keep deleted messages:** Clear kept messages from its settings, with a count of what's kept
* **Discord - Translate messages:** Clear saved translations from its settings

### 🔧 Improvements

* **Discord - Venus settings:** Settings is now Features, in six groups, from Messages to Quests
* **Discord - Venus settings:** Shorter, clearer titles and descriptions for every feature and option
* **Discord - Venus settings:** Option pages show a status card, Discord's radio lists and short notes
* **Discord:** Patches are named by what they do, the same as in Venus
* **Discord - Send Nitro stickers and emojis as links:** Removed Always send links, which only replaced emojis you could already use
* **Discord - Skip delete confirmation:** One switch now covers both messages and link previews
* **Discord - Pastel name colors:** Webhooks always get their color from their name
* **Discord - User and server reviews:** The send button always uses the profile's colors

## [1.9.0](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.8.0...v1.9.0) (2026-10-13)

### ✨ New Features

* **Discord:** Add `ValidUser` patch
* **Discord - ValidUser:** Fix @unknown-user mentions automatically, with no extra taps
* **Discord:** Add `Profile bar settings button` patch
* **Discord - Profile bar settings button:** Open Venus settings from a button next to the notifications bell
* **Discord:** Add `Split Large Messages` patch
* **Discord - Split Large Messages:** Send messages over the limit as several, keeping code blocks closed
* **Discord:** Add `Translate messages` patch
* **Discord - Translate messages:** Show messages in other languages translated into your language, newest first
* **Discord - Translate messages:** Keep translations on your phone, so reopened chats show them at once

### 🐛 Bug Fixes

* **Discord - Pastelize:** Fixed Color message text leaving the quoted message in a reply uncolored instead of using that author's pastel color ([#45](https://github.com/VenusIsJaded/Venus-Patches/issues/45))

### 🔧 Improvements

* **Discord - Venus settings:** Every feature starts off, so nothing changes until you turn it on

## [1.8.0](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.7.0...v1.8.0) (2026-10-12)

### ✨ New Features

* **Discord - Disable telemetry and touch logging:** Also stop per-screen smoothness (jank) stats from being saved and sent

### 🐛 Bug Fixes

* **Discord - Disable advertising identifiers:** Fixed AppsFlyer still reading your Google advertising ID directly even with the patch enabled
* **Discord - QuickDelete:** Fixed link preview removals still skipping the confirmation prompt after QuickDelete was turned off
* **Discord - NoDelete:** Fixed typing 0 as the maximum saved messages immediately resetting the limit back to 512
* **Discord - NoDelete:** Fixed NoDelete writing a saved messages file too large to read back on the next startup
* **Discord - NoDelete:** Fixed kept messages and edit history from servers you left staying in memory and storage forever
* **Discord - Quest Completer:** Fixed Quest Completer not starting until a reconnect when Discord connected before saved settings finished loading
* **Discord - Force system emojis:** Fixed keycap emojis like 1️⃣ and #️⃣ still showing Discord's Twemoji images instead of your phone's emojis
* **Discord - Force system emojis:** Fixed React Native emojis not matching native chat emojis when the saved settings file couldn't be read
* **Discord - Force system emojis:** Fixed outdated cached emoji drawings continuing to show after a system or emoji font update
* **Discord - Force system font:** Fixed tapping Reopen now restarting Discord before the new font setting finished saving, or when saving failed
* **Discord - Read All:** Fixed Read All showing "Nothing unread" even when unread servers or DMs couldn't be cleared yet
* **Discord - Message tap gestures:** Fixed turning gestures off mid-tap still opening the message editor or starting a reply
* **Discord - Custom voice messages:** Fixed cancelling an audio upload while it was converting deleting the message instead of only stopping the conversion
* **Discord - FreeNitro:** Fixed sticker or emoji names containing `||`, `~~` or `#` turning the sent link label into a spoiler, strikethrough or heading

### 🔧 Improvements

* **Discord - Read All:** Say why unread items couldn't be cleared and which servers were marked as read
* **Discord - Force system emojis:** Old emoji drawings are removed from the cache in the background
* **Discord - Disable telemetry and touch logging:** Say that it also stops per-screen smoothness stats
* **Discord - Disable advertising identifiers:** Say that it stops both Discord and AppsFlyer reading the ID

### ⚡ Performance Improvements

* **Discord - Pastelize:** One copy of each chat row's message instead of up to four
* **Discord - Pastelize:** Mentions are copied only when something in them actually changes
* **Discord - Hide call button:** Look up the call icon once per profile instead of per element
* **Discord - Hidden Channels:** Reuse one renamed copy per locked channel instead of copying it every lookup
* **Discord - Hidden Channels:** No longer copy every channel of every server when Discord connects
* **Discord - NoDelete:** Edit history reuses the joined message content until something changes
* **Discord - Dashless:** Check channel types without building a list every time
* **Discord - Custom voice messages:** Check audio file types without building a list every time
* **Discord - PlatformIndicators:** Less work on every presence update
* **Discord - Venus settings:** Row switches and arrows are found once instead of on every render
* **Discord - File size on picker:** Known sizes show straight away on recycled photo tiles, never an old one
* **Discord - File size on picker:** Size badges share one style instead of making new ones per tile
* **Discord - Force system font:** Threads meeting a new font family share one cache slot

## [1.7.0](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.6.0...v1.7.0) (2026-10-11)

### ✨ New Features

* **Discord:** Add `Hide call button` patch, which removes Call from profiles so Message fills the row

### 🐛 Bug Fixes

* **Discord - Message tap gestures:** Fixed tapping your own message three times opening the message editor before the third tap arrived instead of deleting it
* **Discord - Venus settings:** Fixed sub-options on a feature's page staying interactive while the feature's main switch was turned off
* **Discord - NoDelete:** Fixed the maximum saved messages text box remaining editable while NoDelete was turned off

### 🔧 Improvements

* **Discord - Venus settings:** Clearer descriptions for every setting
* **Discord - NoDelete:** Say that it also keeps what edited messages said before
* **Discord - Pastelize:** Say that each color comes from the person's user ID
* **Discord - Message tap gestures:** Describe the Edit it and Reply to it choices

## [1.6.0](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.5.0...v1.6.0) (2026-10-11)

### ✨ New Features

* **Discord - Message tap gestures:** Double-tap a message to reply, or your own message to edit it
* **Discord - Message tap gestures:** Tap your own message three times to delete it
* **Discord - NoDelete:** Show what an edited message said before, faded and crossed out above it

### 🐛 Bug Fixes

* **Discord:** Fixed passkey and security key prompts failing with "RP ID cannot be validated" instead of explaining why Android blocks them in a re-signed APK ([#37](https://github.com/VenusIsJaded/Venus-Patches/issues/37))
* **Discord - NoDelete:** Fixed deleted messages permanently stopping from saving on disk if the saved archive file became corrupted
* **Discord - Venus settings:** Fixed the About page displaying an outdated Venus Patches version number
* **Discord - Read All:** Fixed error toasts starting with a redundant "Error:" prefix

### ⚡ Performance Improvements

* **Discord - NoDelete:** Saving a deleted message no longer rewrites every other saved message
* **Discord - NoDelete:** Chats with kept messages do fewer checks per message
* **Discord - Hidden Channels:** Do less work while turned off

## [1.5.0](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.4.4...v1.5.0) (2026-10-11)

### ✨ New Features

* **Discord:** Add `Force system font` patch
* **Discord:** Add `Force system emojis` patch
* **Discord:** Add `Hide gift button` patch
* **Discord:** Add `Hide Quests promotion` patch

### 🔧 Improvements

* **Discord - Venus settings:** Plugins is now Settings, grouped into Chat, Profiles and people, Servers and channels, and More
* **Discord - Venus settings:** Each switch says what it does instead of showing a plugin name
* **Discord - Venus settings:** Settings with more options have a switch and an arrow button
* **Discord - Venus settings:** Options are greyed out while their main switch is off
* **Discord - Quest Completer:** Starts off until you turn on Complete Quests automatically

## [1.4.4](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.4.3...v1.4.4) (2026-10-10)

### 🐛 Bug Fixes

* **Discord - Read All:** Fixed the server list reusing stale props from an older render when the guild list data had not changed
* **Discord - Quest Completer:** Fixed Play Quests leaving the game executable unnamed for the rest of the session if looking up the game failed once while offline
* **Discord - Quest Completer:** Fixed a temporary network error when enrolling in a Quest pausing retries for 6 hours instead of retrying after a few minutes
* **Discord - Quest Completer:** Fixed Quest Completer sending heartbeats forever when Discord stopped counting progress for a stuck Quest
* **Discord - ReviewDB:** Fixed the close button on the review overflow menu not closing the action sheet

### ⚡ Performance Improvements

* **Discord - NoDelete:** Opening Discord no longer rewrites saved deleted messages
* **Discord - Quest Completer:** The settings page no longer redraws every 5 seconds

## [1.4.3](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.4.2...v1.4.3) (2026-10-09)

### 🐛 Bug Fixes

* **Discord - Quest Completer:** Fixed Play Quests failing with "HTTP 401" and never finishing because Discord's native interceptor overwrote the desktop User-Agent
* **Discord - Quest Completer:** Fixed non-mobile Activity Quests being rejected with "HTTP 401" for the same reason

### 🔧 Improvements

* **Discord - Quest Completer:** Play time is reported once a minute, the way Discord for Windows does

## [1.4.2](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.4.1...v1.4.2) (2026-10-09)

### ✨ New Features

* **Discord - Quest Completer:** Complete Play Quests without installing or starting the game
* **Discord - Quest Completer:** Add a Play Quests switch

## [1.4.1](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.4.0...v1.4.1) (2026-10-09)

### ✨ New Features

* **Discord:** Add `Quest Completer` patch, which accepts and completes video and Activity Quests in the background

## [1.4.0](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.3.9...v1.4.0) (2026-10-09)

### 🐛 Bug Fixes

* **Discord - ReviewDB:** Fixed refreshing a profile's reviews evicting another open profile's cached reviews
* **Discord - Hidden Channels:** Fixed some locked channels missing from the server channel list when their category was collapsed or empty

### 🔧 Improvements

* **Discord:** Restore the 1.3.8 feature names in Morphe and Venus settings
* **Discord - PlatformIndicators:** Restore the original icons

### ⚡ Performance Improvements

* **Discord - NoDelete:** Lowering the maximum is instant
* **Discord - NoDelete:** Smoother chats with NoDelete or Pastelize on
* **Discord - Hidden Channels:** Opening a server does less work

## [1.3.9](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.3.8...v1.3.9) (2026-10-09)

### 🔧 Improvements

* **Discord:** Name every feature after what it does
* **Discord - PlatformIndicators:** New device icons
* **Discord:** Remove the size cap on Venus's built-in code

## [1.3.8](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.3.7...v1.3.8) (2026-10-09)

### 🐛 Bug Fixes

* **Discord - NoDelete:** Fixed turning NoDelete off wiping permanently saved deleted messages from disk
* **Discord - Read All:** Fixed a single DM channel without a last message stopping the rest of your DMs from being marked as read
* **Discord - JumpToTop:** Fixed the channel long-press action sheet remounting from scratch on every state update

### ⚡ Performance Improvements

* **Discord - Hidden Channels:** Half the permission checks
* **Discord - PlatformIndicators:** Less work when people come online, type or change status
* **Discord - NoDelete:** Less work when messages are deleted

## [1.3.7](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.3.6...v1.3.7) (2026-10-08)

### 🐛 Bug Fixes

* **Discord - Disable crash reporting:** Fixed native Sentry and CrashReporting methods still sending crash reports because of a wrong DEX return-value opcode
* **Discord - JumpToTop:** Fixed the Jump to Top option not appearing in the long-press menu for threads and forum posts
* **Discord - PlatformIndicators:** Fixed device icons not showing next to members inside the voice channel panel
* **Discord - ReviewDB:** Fixed Copy Text and profile review cards failing to render on Discord 348.10

### ⚡ Performance Improvements

* **Discord - PlatformIndicators:** Icons only update when that person's status changes

### 🚀 Updated App Support

* **Discord:** Add support for `348.10 - Stable` and drop `347.12`

## [1.3.6](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.3.5...v1.3.6) (2026-10-08)

### ✨ New Features

* **Discord:** Add `Read All` patch

### 🐛 Bug Fixes

* **Discord - Pastelize:** Fixed Color message text turning messages solid blue and printing literal "usernameOnClick" text in chat

## [1.3.5](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.3.4...v1.3.5) (2026-10-08)

### 🐛 Bug Fixes

* **Discord - File size on picker:** Fixed files just under 1 MB rounding up to "1024 KB" instead of "1 MB"
* **Discord - NoDelete:** Fixed backspacing the maximum saved messages input box immediately resetting it to 512 while typing

### 🔧 Improvements

* **Discord:** Group patches under Plugins and Privacy in Morphe, with plain descriptions
* **Discord - Venus settings:** Changing an option applies right away

### ⚡ Performance Improvements

* **Discord - NoDelete:** Less background work with saving off
* **Discord:** Patching is faster

## [1.3.4](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.3.3...v1.3.4) (2026-10-07)

### 🐛 Bug Fixes

* **Discord:** Fixed Morphe Manager failing to add Venus Patches as a source with "The patch bundle could not be downloaded"

### ⚡ Performance Improvements

* **Discord - Pastelize:** Name colors are reused instead of worked out for every message
* **Discord:** Patching uses less memory

## [1.3.3](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.3.2...v1.3.3) (2026-10-07)

### ✨ New Features

* **Discord - Custom voice messages:** Use Discord's own waveform
* **Discord - Custom voice messages:** Support more WAV types and more audio files

### 🐛 Bug Fixes

* **Discord - Custom voice messages:** Fixed audio files failing to convert into voice messages with "Audio format changed during decoding" when the decoder adjusted its output format

## [1.3.2](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.3.1...v1.3.2) (2026-10-06)

### ✨ New Features

* **Discord - ReviewDB:** Open server reviews inside the server menu

## [1.3.1](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.3.0...v1.3.1) (2026-10-06)

### 🐛 Bug Fixes

* **Discord - PlatformIndicators:** Fixed React crashing with "Rendered fewer hooks than expected" when switching between chats

## [1.3.0](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.2.9...v1.3.0) (2026-10-05)

### ✨ New Features

* **Discord - PlatformIndicators:** Show icons in the DM list and DM top bar

### 🐛 Bug Fixes

* **Discord - NoDelete:** Fixed the red outline on deleted messages only appearing after leaving and reopening the chat

## [1.2.9](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.2.8...v1.2.9) (2026-10-05)

### ✨ New Features

* **Discord - NoDelete:** Add Save permanently and a maximum number of saved messages

### 🐛 Bug Fixes

* **Discord - NoDelete:** Fixed your own deleted messages disappearing instead of being kept in chat
* **Discord - ReviewDB:** Fixed tapping Reviews in the server menu not opening the server's reviews sheet

## [1.2.8](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.2.7...v1.2.8) (2026-10-05)

### ✨ New Features

* **Discord:** Add `Disable advertising identifiers` patch

### 🐛 Bug Fixes

* **Discord:** Fixed a cached over-the-air Discord bundle update bypassing all Venus patches and privacy options

## [1.2.7](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.2.6...v1.2.7) (2026-10-05)

### ✨ New Features

* **Discord:** Add `Disable analytics`, `Disable crash reporting`, `Disable telemetry and touch logging` and `Disable install attribution` patches

## [1.2.6](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.2.5...v1.2.6) (2026-10-05)

### 🐛 Bug Fixes

* **Discord - ReviewDB:** Fixed OAuth sign-in discarding the authorization token because Discord dismissed the modal before invoking the callback
* **Discord - NoDelete:** Fixed kept deleted messages appearing out of chronological order in chat

## [1.2.5](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.2.4...v1.2.5) (2026-10-05)

### 🔧 Improvements

* **Discord - ReviewDB:** Use Discord's own look, and ask before deleting or reporting

## [1.2.4](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.2.3...v1.2.4) (2026-10-05)

### ✨ New Features

* **Discord - Hidden Channels:** Tapping a locked channel shows when it was created and last used

### 🐛 Bug Fixes

* **Discord - Hidden Channels:** Fixed tapping a locked channel opening two info popups one after another

## [1.2.3](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.2.2...v1.2.3) (2026-10-04)

### 🐛 Bug Fixes

* **Discord - Hidden Channels:** Fixed locked channels showing placeholder text instead of their real channel names when Discord redacted the store

## [1.2.2](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.2.1...v1.2.2) (2026-10-04)

### 🐛 Bug Fixes

* **Discord:** Fixed ReviewDB, Hidden Channels, PlatformIndicators and NoDelete missing UI elements and behavior from the original plugins

## [1.2.1](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.2.0...v1.2.1) (2026-10-04)

### 🐛 Bug Fixes

* **Discord:** Fixed Pastelize, ReviewDB, Hidden Channels, PlatformIndicators and NoDelete failing to activate on startup

## [1.2.0](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.1.1...v1.2.0) (2026-10-04)

### ✨ New Features

* **Discord:** Add `Pastelize`, `PlatformIndicators` and `ReviewDB` patches

## [1.1.1](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.1.0...v1.1.1) (2026-10-04)

### ⚡ Performance Improvements

* **Discord - Custom voice messages:** Faster conversion

## [1.1.0](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.0.0...v1.1.0) (2026-10-04)

### ✨ New Features

* **Discord:** Add `No typing`, `QuickDelete`, `NoDelete`, `JumpToTop` and `Hidden Channels` patches

## [1.0.0](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.0.0-dev.3...v1.0.0) (2026-10-04)

### ✨ New Features

* **Discord:** Add `Venus settings`, `CopyBios`, `Dashless`, `FavouriteAnything` and `FreeNitro` patches

## [1.0.0-dev.3](https://github.com/VenusIsJaded/Venus-Patches/compare/v1.0.0-dev.1...v1.0.0-dev.3) (2026-10-03)

### 🐛 Bug Fixes

* **Discord:** Fixed Discord crashing or freezing on startup after patching because the runtime was loaded as a second JS bundle in Bridgeless mode

## 1.0.0-dev.1 (2026-10-03)

### ✨ New Features

* **Discord:** Add `File size on picker` and `Custom voice messages` patches
