#!/bin/sh
# Ink Maze level 26: rebuild the Java toolchain in public/minigames/ink-maze-code/java/.
#
#   JAVA_HOME=~/Library/Java/JavaVirtualMachines/temurin-25.0.3.jdk/Contents/Home \
#     sh scripts/inkmaze-code/build/java/build.sh
#
# What it does (the recipe in public/minigames/ink-maze-code/java/PROVENANCE.txt):
#  1. downloads teavm-javac at commit 2ddcf02 (TeaVM 0.13.1) and checks its hash;
#  2. applies upstream commit 199bed0 (rename-fix-199bed0.diff) and this site's
#     patch (teavm-javac-inkmaze.patch: the Guard, GuardTransformer, System.exit
#     for javac, the unreachable-tail fix, the diagnostic fixes);
#  3. builds it with its Gradle wrapper (Gradle 9.1, needs Temurin 25; the build
#     downloads the OpenJDK jdk25u sources at the pinned revision and the Maven
#     dependencies the first time; set OFFLINE=1 to build from the Gradle cache);
#  4. compiles the hidden harness (InkMazeHarness.java) ahead of time with the
#     same JDK, against teavm-interop and the Guard;
#  5. copies the outputs (compiler.wasm gzipped as compiler.gz.bin) next to
#     runtime.js and prints their SHA-256 for PROVENANCE.txt.
# runtime.js itself is written by hand and not touched.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../../../.." && pwd)
OUT=${OUT:-"$REPO/public/minigames/ink-maze-code/java"}
COMMIT=2ddcf02e4983e5c74d45b945c2fd41a829358828
ZIP_SHA256=2bc0df47265054653ce6f52cee144184470dc0eba1ea6f6da38d53302d86e38e
WORK=${WORK:-$(mktemp -d "${TMPDIR:-/tmp}/inkmaze-java.XXXXXX")}

: "${JAVA_HOME:?set JAVA_HOME to a JDK 25 (Temurin 25.0.3 was used)}"
"$JAVA_HOME/bin/java" -version 2>&1 | head -1

echo "working in $WORK"
cd "$WORK"
if [ ! -f teavm-javac.zip ]; then
  curl -fL -o teavm-javac.zip "https://github.com/konsoletyper/teavm-javac/archive/$COMMIT.zip"
fi
echo "$ZIP_SHA256  teavm-javac.zip" | shasum -a 256 -c -
rm -rf "teavm-javac-$COMMIT"
unzip -q teavm-javac.zip
cd "teavm-javac-$COMMIT"
patch -p1 < "$HERE/rename-fix-199bed0.diff"
patch -p1 < "$HERE/teavm-javac-inkmaze.patch"

# the javac subproject downloads the OpenJDK sources (jdk25u at the revision in gradle.properties, ~150 MB);
# JDK_ZIP=<that zip> reuses a copy
if [ -n "${JDK_ZIP:-}" ]; then
  mkdir -p javac/build
  cp "$JDK_ZIP" "javac/build/jdk-$(sed -n 's/^jdk.revision=//p' gradle.properties).zip"
fi
if [ "${OFFLINE:-0}" = 1 ]; then GRADLE_FLAGS=--offline; else GRADLE_FLAGS=; fi
JAVA_HOME="$JAVA_HOME" ./gradlew $GRADLE_FLAGS --no-daemon :compiler:build -x test

BUILD="$PWD/compiler/build"
INTEROP=$(find "${GRADLE_USER_HOME:-$HOME/.gradle}/caches/modules-2/files-2.1/org.teavm/teavm-interop/0.13.1" -name 'teavm-interop-0.13.1.jar' | head -1)
[ -n "$INTEROP" ] || { echo "teavm-interop-0.13.1.jar is not in the Gradle cache" >&2; exit 1; }
mkdir -p "$WORK/harness"
"$JAVA_HOME/bin/javac" --release 25 -g -XDstringConcat=inline \
  -cp "$INTEROP:$BUILD/classes/java/main" -sourcepath "$HERE/stub" -implicit:none \
  -d "$WORK/harness" "$HERE/InkMazeHarness.java"

mkdir -p "$OUT"
gzip -9 -n -c "$BUILD/generated/teavm/wasm-gc/compiler.wasm" > "$OUT/compiler.gz.bin"
cp "$BUILD/generated/teavm/wasm-gc/compiler.wasm-runtime.js" "$OUT/teavm-runtime.js"
cp "$BUILD/generated/teavm/wasm-gc/compiler.wasm-deobfuscator.wasm" "$OUT/deobfuscator.wasm"
cp "$BUILD/classlib/compile-classlib-teavm.bin" "$OUT/compile-classlib.bin"
cp "$BUILD/classlib/runtime-classlib-teavm.bin" "$OUT/runtime-classlib.bin"
cp "$WORK/harness/InkMazeHarness.class" "$OUT/InkMazeHarness.class"

echo "SHA-256 (for PROVENANCE.txt):"
cd "$OUT"
shasum -a 256 "$BUILD/generated/teavm/wasm-gc/compiler.wasm" compiler.gz.bin teavm-runtime.js deobfuscator.wasm compile-classlib.bin runtime-classlib.bin InkMazeHarness.class
