# Changelog

## 1.2.4 — Hidden Channels parity, original-style popup and precise timestamps

- Hidden Channels now matches the original plugin's behavior: global `VIEW_CHANNEL` bypass on both permission modules (`4427` and `4428`, found via HBC `getChannelPermissions` trace) so Discord builds real channel records instead of obfuscated `hidden` stubs. Message and voice fetching/navigation stay guarded behind an explicit View Anyway confirmation.
- Gateway names (`CONNECTION_OPEN`, `GUILD_CREATE`, updates, thread syncs) and message `mention_channels` are cached even while the toggle is off, so enabling later still resolves. Server redactions (`hidden`, `__hidden__`, `_hidden` variants) and our own unavailable facades are never cached as real names.
- The hidden-channel popup mirrors the original: topic, creation date, last message and last pin with **precise** relative timestamps ("8 days, 7 hours and 7 minutes ago") plus the absolute date, Cancel / View Anyway buttons, and a 20px native lock icon next to hidden names.
- The hidden-channel sheet is Discord-native themed (same modal stack and theme context as ReviewDB auth): precise Creation date / Last message / Last pin rows only — no title text, no channel name, no category, no topic — with Cancel / View Anyway actions. A plain alert remains as fallback only.
- Truly server-redacted channels (no name in any received source) still show name unavailable rather than a guessed name; message and voice access are never granted.
- ChannelInfo is hooked as both default and named export, so the lock renders on rows that consume it by name (e.g. GuildRolesAndChannelsRow).

## 1.2.3 — traced OAuth lifecycle, shared profile/server reviews and native channel names

- Disassembled the supplied unmodified Discord 347.12 HBC98, verified its pinned hash, and traced native OAuth completion down to nested success generator #124513. Native dismissal occurs without awaiting the ReviewDB token exchange; preserve validated exchanges instead of misclassifying completion as cancellation.
- Move enable/authentication/status/logout into Settings → Venus → Plugins → ReviewDB, using native switch/row/group components. No auth/logout actions on user or server reviews. Preserve account-scoped session-only credentials, cancellation/account guards, service failures/retry and request/JSON timeout.
- Hook the shared About Me card (module 11502) for normal/bot/compact/tabbed profile callers, not PrimaryInfo. Add guild-ID server reviews through GuildActionSheetProgress (module 14273), including when native progress returns null; retain onboarding. Use unclamped selectable comments and independent target keys.
- Hidden Channels: include full/basic-only channel/category metadata; capture READY, supplemental and update names before native reducers; scope initial names to the incoming account; repair list-local ChannelStore dereferences; preserve native formatter escaping and category casing. Do not mutate real permission results, model flags or singleton state. Basic-only fetch/navigation stays metadata-only.
- Unsent/server-redacted names remain explicitly unavailable. No attempt to guess names or fetch restricted content. No native APK patching with Morphe Patcher was performed for this release.
- Expanded readable/compact runtime regressions, including the actual callback/dismiss sequence, reopened profiles/server sheets, settings-only auth, guild requests/mutations, account changes, startup metadata, basic-only navigation, native store receivers and formatting. Separate Hermes eval, JVM PCM and HBC structural validation do not replace Android/live service acceptance.

Repatch the original APKM with `patches-1.2.3.mpp`. ReviewDB sign-in survives profile/sheet reopening but deliberately does not persist across restarting Discord.

## 1.2.2 — authentication and original-style UI repairs

- ReviewDB: native string/object callback support, strict fixed-domain callback rebuilding without URL polyfill dependencies, native helper demand-loading, fresh consent, and a fetch/JSON-body deadline even without AbortController. Keep supported `vendetta` protocol, session-only tokens and cancellation/account guards.
- ReviewDB UI: native grouped cards, 36-pixel reviewer avatars, badges, dates, selectable comments, empty-list feedback and a themed composer. System notices cannot be reported/deleted; late mutation results cannot update a logged-out account.
- Hidden Channels: real received basic/full/cached names on both channels and categories, immutable directory views and no textual `[locked]` suffix. Native locks on ChannelInfo. Server-only `__hidden__` names are explicitly unavailable, never guessed or fetched. Name caches clear on logout, account switch, deletion and disabling.
- PlatformIndicators: add single-user DM headers/lists, friend/user rows and voice-member rows. Use an independent outlined monitor silhouette; preserve the native phone icon, live subscriptions and own-session source. Full upstream guild-member-list parity is not claimed.
- NoDelete: preserve original message text and native record descriptors; remove both `[Deleted]` injection and the deleted-notice embed. Retained rows have red-only background/gutter, including archive restoration and attachment-only messages.
- 122 readable runtime tests pass; one optional Hermes eval test is skipped without an interpreter. The same suite is run against compact release JavaScript. JVM PCM tests cover 59 checks.

The supplied 347.12 asset matches the pinned hash. Successful account OAuth, final Android layouts and hardware/runtime behavior remain device-unverified. Repatch the original APKM with `patches-1.2.2.mpp`.

## 1.2.1 — five plugin repairs

- Fixed Pastelize's CommonJS MurmurHashV3 binding, native name colors, source-role preservation and guild-member guards.
- Fixed ReviewDB OAuth: live service rejects `clientMod=venus`; use the original supported `vendetta` protocol value. Add timeout, service errors and cancellation/account-switch protection. Session credentials only.
- Replaced obfuscated No Access labels in both native channel formatters with already-received names; include locked and empty categories in the list-local metadata facade, leaving real permissions/navigation protected.
- Replaced profile platform text labels with Discord's native status-tinted Screen/Phone/Globe/Controller icons; use own SessionsStore and clean up both subscriptions. Profile-only scope remains explicit.
- Fixed NoDelete retention for real immutable ChannelMessages (no public clone method); send a changed native update payload and add red gutter/background plus native deleted notice without AutoMod dispatcher events.
- Added ten targeted regressions; 109 Node tests pass, with one optional Hermes eval test skipped when no interpreter is configured. The same suite runs against compact release JavaScript.

This is code/schema and automated validation, not a physical-device or successful user OAuth test. Repatch the original 347.12 APKM with patches-1.2.1.mpp. Missing channel metadata and uncached deleted content cannot be recovered.

## 1.2.0 — chat reliability, requested ports and voice formats

- Native themed JumpToTop fallback with composer/suggestion height hooks.
- Hidden Channels native type buckets and list-local visibility facade, without changing the real permission store.
- NoDelete independent snapshots through message/cache updates; opt-in account-scoped local archive (512 entries, 8 MiB), erase-on-save-off and logout clearing.
- Added selectable Pastelize, profile-only PlatformIndicators and opt-in ReviewDB with explicit requests/native identify-only OAuth and session credentials.
- Added streaming WAV/RIFX/extensible and AIFF/AIFF-C integer/float decoding, more audio aliases, decoder checks and validated native waveform payloads.
- Expanded readable/compact JavaScript regressions and JVM PCM/container checks. Native renderer consumes measured waveform data; no public native file-waveform generator was found.

Android launch, physical codecs, native UI and live ReviewDB OAuth/service behavior remain device-unverified. PlatformIndicators DM-header/member-list icons remain outside this port.

## 1.1.1 — performance and reliability audit

- Added a bulk-copy 48 kHz mono PCM16 path and pre-sized resampling arrays, while retaining real waveforms, clipping and duration limits. Synthetic JVM mono conversion is roughly 4× faster in representative runs; generic stereo resampling is not claimed faster, and Android timings remain unmeasured.
- Scoped picker/toggle subscriptions, structurally shared unchanged React child arrays, LRU completed-size eviction and early disabled-feature exits reduce avoidable work.
- Coalesced preference persistence to one active write and one latest waiting snapshot.
- Fixed invalid size values becoming zero-byte files, pre-bridge queues stalling without a preferences directory, and queued reads continuing after picker-off restoration.
- Fixed same-turn voice cancellation submitting preparation afterward; validate finite bounded duration and integral size metadata; reject malformed preference shapes and non-finite floating PCM.
- Release codecs even if configuration/start fails, stop encoder draining at EOS and clean failed outputs if metadata generation fails.
- Added pinned parser-only prelude compaction (about 29% fewer script characters) without identifier mangling or scope rewriting, tested with the full runtime suite in readable and compact forms.
- Verify newly downloaded tools before caching, remove stale DEX outputs and normalize bundle ZIP entries for repeatable artifacts.
- Added nine JavaScript regression cases, expanded native PCM checks from 15 to 34, and added a reproducible synthetic benchmark. Improved README installation, upgrade, performance methodology and troubleshooting guidance.

Device launch, physical codecs, playback and Android performance still require device testing. This release targets patch overhead and identified defects, not every bug in Discord.

## 1.1.0 — media fixes and five new bundled plugins

- Added No typing, QuickDelete, NoDelete, JumpToTop and Hidden Channels as independently selectable offline patches.
- Fixed media component wrapping by preserving Metro markers, React tags and all stock property descriptors.
- Fixed FreeMoji selection against the real default capability object and direct emoji catalog; keep native eligibility separate from link conversion.
- Moved FileSizeOnPicker and Custom voice messages from General into Plugins.
- Added opt-in destructive/privacy-sensitive controls, bounded session retention and metadata caches, immutable native UI transforms and locked-channel navigation guards.
- Retained native settings, existing bundled plugins and real Opus conversion.

Published on the non-prerelease channel. Automated checks do not replace real-device validation. Hidden Channels cannot grant access; NoDelete cannot retrieve uncached messages; FreeNitro shares CDN links rather than Nitro entitlements.

## 1.0.0 — native settings and bundled plugins

- Replaced the floating Venus button with a native Discord settings section, without author rows.
- Added CopyBios, Dashless and FavouriteAnything.
- Combined FreeEmojis and FreeStickers into FreeNitro with separate on/off switches.
- Improved startup overhead, plugin performance and safe fallback behavior.
- Retained existing file-size and custom voice-message features.

Published on the non-prerelease channel. Automated build/logic checks do not replace real-device validation. APNG sticker previews may be static; Lottie conversion is not included.

## 1.0.0-dev.3 — eval-scope capture revision

New `v1.0.0-dev.3` prerelease with `patches-1.0.0-dev.3.mpp`. Repatch the original APKM and verify Morphe shows **1.0.0-dev.3**.

- Isolate loop-captured hook bindings behind invocation parameters (`replacementFor`) and give async size callbacks an invocation scope (`readSize`).
- Fail fast at hook time with a Venus-marked error when an export binding is unusable, so the module stays stock and Discord boots instead of crashing at call time.
- No behavior change on engines with correct block scoping; the guards never fire there.

Fixes the instant-crash `TypeError: undefined is not a function` at `replacement` during Hermes bundle init (Discord 347.12, `replacement@387`/`@393`), traced to shared loop captures in eval-compiled prelude code via HBC disassembly.

## 1.0.0-dev.2 — single-load startup revision

Replacement `.mpp` on the existing `v1.0.0-dev.1` prerelease; manifest/source version advances to distinguish cached copies.

- Remove injected private native loader calls and the separate bootstrap main-bundle load entirely.
- Insert a guarded, fail-open prelude in the pinned HBC98 global entry while preserving original instructions and other original bytecode tables.
- Defer feature hooks until the actual `setUpDefaltReactNativeEnvironment` initializer returns successfully; guard reentrant and failed initialization.
- Preserve mutable export identity and add single-load DEX, HBC relocation/footer and startup regressions.
- Keep the earlier native Kotlin helper/field linkage fixes. Repatch the original APKM and verify Morphe shows **1.0.0-dev.2**.

Android device launch and server playback still require device testing; the prior opcode-only hotfix did not resolve the reported crashes.

## 1.0.0-dev.1 — 2026-10-03

### Startup hotfix — replacement asset

- Correct the ReactInstance private native asset-loader call from `invoke-virtual` to `invoke-direct`; enforce its private/native ABI before patching.
- Replace extension calls to Kotlin helpers and the renamed `kotlin.Unit.INSTANCE` field absent from Discord's obfuscated runtime with Java APIs and explicit cleanup guards.
- Bypass the voice extension entirely for ordinary file-size requests.
- Add private-invoke and real-host method/field/type linkage regressions; the verifier rejects the original release.
- Replace the `.mpp`, checksum and verification report on the existing prerelease. Redownload the source and repatch the original APKM using the same signing key.

### Initial features

First experimental release for Discord **347.12 - Stable / 347012**.

- Cached file-size badges in the media picker.
- Opt-in native Ogg/Opus conversion with measured duration and PCM-derived waveform (Android 10+).
- Persistent Venus menu, cancellation, codec fallback and hook diagnostics.
- Version- and bundle-guarded patching with a bundled offline runtime.

Build, automated logic tests, DEX placement and APK signing are checked. Android launch, physical codecs and Discord playback remain unverified; this is not a stable compatibility claim.
