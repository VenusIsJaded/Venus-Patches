# Changelog

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
