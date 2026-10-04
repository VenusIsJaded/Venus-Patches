# Changelog

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
