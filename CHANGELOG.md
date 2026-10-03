# Changelog

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
