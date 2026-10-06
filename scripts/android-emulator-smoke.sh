#!/usr/bin/env bash
set -euo pipefail
mkdir -p emulator-results
pkg=com.getqueuedrop.printbridge.test
adb install -r android-printbridge/app/build/outputs/apk/debug/app-debug.apk
adb shell pm grant "$pkg" android.permission.BLUETOOTH_CONNECT || true
adb shell pm grant "$pkg" android.permission.BLUETOOTH_SCAN || true
adb logcat -c
check_setup() {
  local label="$1"
  adb shell uiautomator dump /sdcard/window.xml
  adb pull /sdcard/window.xml "emulator-results/$label.xml"
  grep -q 'QueueDrop Kiosk Setup' "emulator-results/$label.xml"
  adb shell pidof "$pkg"
  adb exec-out screencap -p > "emulator-results/$label.png"
}
adb shell am start -W -n "$pkg/com.getqueuedrop.printbridge.MainActivity"
sleep 5
check_setup portrait
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 1
sleep 3
check_setup landscape
adb shell input keyevent KEYCODE_HOME
sleep 2
adb shell am start -W -n "$pkg/com.getqueuedrop.printbridge.MainActivity"
sleep 3
check_setup resumed
adb shell am force-stop "$pkg"
adb shell settings put system user_rotation 0
adb shell am start -W -n "$pkg/com.getqueuedrop.printbridge.MainActivity"
sleep 3
check_setup restarted
adb logcat -d > emulator-results/logcat.txt
if grep -E 'FATAL EXCEPTION|ANR in com.getqueuedrop.printbridge' emulator-results/logcat.txt; then exit 1; fi
printf 'PASS: install, portrait setup, landscape setup, background/resume, process restart; no fatal crash or ANR. Real printer transport and live kiosk flows are not covered.\n' > emulator-results/summary.txt
