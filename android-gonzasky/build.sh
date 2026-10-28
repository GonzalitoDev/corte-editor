#!/usr/bin/env bash
# Arma GonzaSky.apk sin Gradle: aapt + javac + dx + zipalign + apksigner.
# En Ubuntu/Debian/Mint: sudo apt install aapt dalvik-exchange zipalign apksigner libandroid-23-java openjdk-17-jdk-headless
# Firma: KEYSTORE=ruta.jks KS_PASS=clave ./build.sh   (sin KEYSTORE crea una clave de prueba en build/)
set -euo pipefail
cd "$(dirname "$0")"
ANDROID_JAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
BT=${BT:-$(ls -d /usr/lib/android-sdk/build-tools/*/ | sort -V | tail -1)}
VERSION=${VERSION:-}
OUT=build
rm -rf "$OUT"; mkdir -p "$OUT/assets/www" "$OUT/classes" "$OUT/res"

# Juego web dentro de assets/www
cp -r ../gonzasky/volar "$OUT/assets/www/volar"
cp ../gonzasky/icon.svg "$OUT/assets/www/icon.svg"
cp -r res/. "$OUT/res/"

MANIFEST=AndroidManifest.xml
if [ -n "$VERSION" ]; then
  CODE=$(echo "$VERSION" | awk -F. '{print $1*10000+$2*100+$3}')
  sed -e "s/android:versionCode=\"[0-9]*\"/android:versionCode=\"$CODE\"/" -e "s/android:versionName=\"[^\"]*\"/android:versionName=\"$VERSION\"/" AndroidManifest.xml > "$OUT/AndroidManifest.xml"
  MANIFEST="$OUT/AndroidManifest.xml"
fi

"$BT/aapt" package -f -M "$MANIFEST" -S "$OUT/res" -A "$OUT/assets" -I "$ANDROID_JAR" -F "$OUT/unsigned.apk" -0 jpg -0 png
javac -source 8 -target 8 -bootclasspath "$ANDROID_JAR" -classpath "$ANDROID_JAR" -d "$OUT/classes" -Xlint:-options $(find src -name '*.java')
"$BT/dx" --dex --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && "$BT/aapt" add unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

if [ -z "${KEYSTORE:-}" ]; then
  KEYSTORE="$OUT/prueba.jks"; KS_PASS=gonzacraft
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias gonzacraft -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=GonzaSky prueba" >/dev/null
  echo "Aviso: firmado con una clave de prueba. Para publicar, usá siempre la misma KEYSTORE."
fi
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --ks-key-alias gonzacraft --out "$OUT/GonzaSky.apk" "$OUT/aligned.apk"
"$BT/apksigner" verify "$OUT/GonzaSky.apk"
ls -la "$OUT/GonzaSky.apk"
