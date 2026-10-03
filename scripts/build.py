#!/usr/bin/env python3
"""Build a standard JVM+DEX Morphe bundle from pinned public release toolchains."""
import hashlib
import json
import sys
from datetime import datetime, timezone
import os
from pathlib import Path
import subprocess
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "work" / "tools"
BUILD = ROOT / "patches" / "build"
PROPERTIES = dict(line.split("=", 1) for line in (ROOT / "gradle.properties").read_text().splitlines() if "=" in line)
PROPERTIES = {key.strip(): value.strip() for key, value in PROPERTIES.items()}
VERSION = PROPERTIES["version"]
RELEASE_TAG = PROPERTIES.get("releaseTag", f"v{VERSION}")
ASSET_NAME = PROPERTIES.get("releaseAsset", f"patches-{VERSION}.mpp")
DEPENDENCIES = {
    "android-platform.zip": (
        "https://dl.google.com/android/repository/platform-35_r02.zip",
        "0988cacad01b38a18a47bac14a0695f246bc76c1b06c0eeb8eb0dc825ab0c8e0"),
    "gson.jar": (
        "https://repo.maven.apache.org/maven2/com/google/code/gson/gson/2.14.0/gson-2.14.0.jar",
        "2cbd119bf1961c28788310963dc80ba65f58cdeec1dd139c8bdb1240faa2c36f"),
    "morphe.jar": (
        "https://github.com/MorpheApp/morphe-desktop/releases/download/v1.18.0/morphe-desktop-1.18.0-all.jar",
        "36e20d7a18f655fb5829ae50aadd61217e2208536c0741df5f7799300f758f56"),
    "kotlin24.zip": (
        "https://github.com/JetBrains/kotlin/releases/download/v2.4.0/kotlin-compiler-2.4.0.zip",
        "ba1b9e6eb6ddc3275079224f2e9ea4a2b02eef7d59ce2d38404f04b22613c20a"),
    "r8.jar": (
        "https://storage.googleapis.com/r8-releases/raw/8.12.22/r8.jar",
        "f18a6d1d7b37b7c9c8fbbcb5fd65b62f18bf7ce8f5be8e623b72648e282d964e"),
}


def run(*args, cwd=ROOT):
    subprocess.run([str(a) for a in args], cwd=cwd, check=True,
                   env={**os.environ, "JAVA_OPTS": "-Xmx384m"})


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def tools():
    TOOLS.mkdir(parents=True, exist_ok=True)
    for name, (url, sha) in DEPENDENCIES.items():
        path = TOOLS / name
        if not path.exists():
            print(f"Downloading {name}", flush=True)
            temporary = path.with_suffix(".download")
            urllib.request.urlretrieve(url, temporary)
            temporary.rename(path)
        if digest(path) != sha:
            raise SystemExit(f"Checksum mismatch: {path}; remove it and retry")
    # Always extract the pinned compiler, not an arbitrary previously installed version.
    with zipfile.ZipFile(TOOLS / "kotlin24.zip") as compiler:
        for entry in compiler.infolist():
            target = (TOOLS / entry.filename).resolve()
            if not target.is_relative_to(TOOLS.resolve()):
                raise SystemExit("Unsafe compiler archive path")
        compiler.extractall(TOOLS)
    (TOOLS / "kotlinc/bin/kotlinc").chmod(0o755)
    with zipfile.ZipFile(TOOLS / "android-platform.zip") as platform:
        (TOOLS / "android.jar").write_bytes(platform.read("android-35/android.jar"))


def build():
    tools()
    run("node", "--test", "tests/runtime.test.cjs")
    libs = BUILD / "libs"
    libs.mkdir(parents=True, exist_ok=True)
    # Compile-only bridge ABI stubs are on the classpath, never in the extension DEX.
    stubs = BUILD / "bridge-stubs.jar"
    compiler = TOOLS / "kotlinc/bin/kotlinc"
    run(compiler, "-no-stdlib", "-no-reflect", "-cp", TOOLS / "morphe.jar",
        *sorted((ROOT / "extensions/voice/stubs").rglob("*.kt")), "-d", stubs)
    voice_classes = BUILD / "voice-classes.jar"
    voice_sources = sorted((ROOT / "extensions/voice/src/main/kotlin").rglob("*.kt"))
    run(compiler, "-no-stdlib", "-no-reflect", "-language-version", "2.1", "-api-version", "2.1",
        "-jvm-target", "11", "-Xlambdas=class", "-cp",
        f"{TOOLS / 'android.jar'}:{TOOLS / 'morphe.jar'}:{stubs}",
        *voice_sources, "-d", voice_classes)
    pcm_tests = BUILD / "pcm-tests.jar"
    run(compiler, "-no-stdlib", "-no-reflect", "-cp", f"{voice_classes}:{TOOLS / 'morphe.jar'}",
        ROOT / "tests/native/PcmToolsTest.kt", "-d", pcm_tests)
    run("java", "-Xmx128m", "-cp", f"{pcm_tests}:{voice_classes}:{TOOLS / 'morphe.jar'}", "PcmToolsTestKt")
    voice_dex = BUILD / "voice-dex"
    voice_dex.mkdir(exist_ok=True)
    run("java", "-Xmx384m", "-cp", TOOLS / "r8.jar", "com.android.tools.r8.D8",
        "--release", "--min-api", "26", "--lib", TOOLS / "android.jar",
        "--classpath", TOOLS / "morphe.jar", "--classpath", stubs,
        "--output", voice_dex, voice_classes)
    classes = BUILD / "classes.jar"
    sources = sorted((ROOT / "patches/src/main/kotlin").rglob("*.kt"))
    run(TOOLS / "kotlinc/bin/kotlinc", "-no-stdlib", "-no-reflect",
        "-jvm-target", "11", "-Xlambdas=class", "-cp", f"{TOOLS / 'morphe.jar'}:{TOOLS / 'gson.jar'}",
        *sources, "-d", classes)
    dex = BUILD / "dex"
    dex.mkdir(exist_ok=True)
    run("java", "-Xmx384m", "-cp", TOOLS / "r8.jar", "com.android.tools.r8.D8",
        "--release", "--min-api", "26", "--classpath", TOOLS / "morphe.jar",
        "--classpath", TOOLS / "gson.jar",
        "--output", dex, classes)
    # Same JVM classes + classes.dex layout and manifest keys as the official plugin.
    manifest = "\r\n".join([
        "Manifest-Version: 1.0", "Name: Venus Patches",
        "Description: Discord attachment tools and persistent runtime controls.",
        f"Version: {VERSION}", "Patcher-Version: 1.15.0",
        "Source: https://github.com/VenusIsJaded/Venus-Patches",
        "Author: VenusIsJaded", "License: GPL-3.0", "", "",
    ])
    bundle = libs / ASSET_NAME
    with zipfile.ZipFile(bundle, "w", zipfile.ZIP_DEFLATED) as out:
        out.writestr("META-INF/MANIFEST.MF", manifest)
        with zipfile.ZipFile(classes) as compiled:
            for name in compiled.namelist():
                if name != "META-INF/MANIFEST.MF":
                    out.writestr(name, compiled.read(name))
        for path in sorted((ROOT / "patches/src/main/resources").rglob("*")):
            if path.is_file():
                out.write(path, path.relative_to(ROOT / "patches/src/main/resources"))
        out.write(voice_dex / "classes.dex", "extensions/voice.mpe")
        for path in sorted(dex.glob("classes*.dex")):
            out.write(path, path.name)
    run("java", "-Xmx256m", "-cp", f"{bundle}:{TOOLS / 'morphe.jar'}:{TOOLS / 'gson.jar'}",
        "util.PatchListGeneratorKt", cwd=ROOT / "patches")
    checksum = libs / "SHA256SUMS"
    checksum.write_text(f"{digest(bundle)}  {bundle.name}\n")
    print(f"Bundle: {bundle.relative_to(ROOT)}", flush=True)


def release_metadata():
    metadata = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "description": "Experimental Discord 347.12 patches: picker sizes, native Ogg/Opus voice conversion and persistent controls. Android device tests pending.",
        "download_url": f"https://github.com/VenusIsJaded/Venus-Patches/releases/download/{RELEASE_TAG}/{ASSET_NAME}",
        "page_url": f"https://github.com/VenusIsJaded/Venus-Patches/releases/tag/{RELEASE_TAG}",
        "signature_download_url": "",
        "version": VERSION,
    }
    (ROOT / "patches-bundle.json").write_text(json.dumps(metadata, indent=2) + "\n")


if __name__ == "__main__":
    if "--metadata-only" in sys.argv:
        release_metadata()
    else:
        build()
