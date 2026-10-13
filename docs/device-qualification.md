# Device qualification after the Story and Battle repairs

The APK can be built and inspected here. Actual Android and smartboard play
is still pending: ADB reported no devices, no emulator is installed, and Windows
listed an integrated monitor and touchpad rather than a touchscreen or board.

Local checks passed on the source merged in PR #37:

- Android storage/export boundaries and active-match wake-lock lifecycle.
- Desktop Chrome layout at 360, 768, 1280, 1366, 1920 and 3840 logical pixels.
- Two/four-lane Battle with independent worlds, live canvases, engine-observed
  scoring, final rewards and teardown. Inputs were synthetic pointer events.

These checks do not establish Android WebView behavior, physical simultaneous
touch contacts, board GPU frame rate, or device audio/lifecycle behavior.

The local debug APK built successfully from `fc398b3`. All 92 tracked runtime
files matched its packaged assets byte for byte, with no extra assets. Android
build-tools verified the debug signature, separate qualification app ID and
version suffix. The generated JSON report records its full source SHA and hash.

## Build a separate offline test app

In PowerShell 7, from a clean committed checkout:

```powershell
./scripts/build-qualification-apk.ps1 `
  -JavaHome 'D:/tools/lehs-android/jdk/jdk-17.0.20.1+1' `
  -AndroidSdk 'D:/tools/lehs-android/sdk' `
  -GradlePath 'D:/tools/lehs-android/gradle-8.7/bin/gradle.bat' `
  -OutputDirectory 'C:/Users/mhowe/Downloads/flipgame-qualification'
```

This builds `com.mapzimus.flipgame.qualification`, debug-signed, with its own
saves. It installs alongside the release app. The script checks every bundled
runtime file against the checkout, rejects extra assets, verifies the signature
and app ID, and records the source commit and APK SHA-256. It never publishes.

The public build currently fails its reused-release-identity gate because v1.15
belongs to an earlier commit. A coherent version/cache/asset/Android bump is
required before the next public release; this test build does not bypass that gate.

## Run on Android

Connect the target with USB debugging enabled and accept its authorization prompt.
Record model, Android version and installed WebView version. Install with:

```powershell
& D:/tools/lehs-android/sdk/platform-tools/adb.exe devices -l
& D:/tools/lehs-android/sdk/platform-tools/adb.exe install -r ./flipgame-qualification.apk
& D:/tools/lehs-android/sdk/platform-tools/adb.exe shell am start -n com.mapzimus.flipgame.qualification/com.mapzimus.flipgame.MainActivity
```

Verify offline boot in airplane mode, Story start/shot/result/continue/re-entry,
Tour recovery hints, touch launches, Battle relay on phone width, rotate/resize,
background/resume during an attempt, audio after resume, and save retention after
force-stop/relaunch. Compare the same progression and reward behavior with the
web app at the recorded commit. Capture logcat crashes and failed transitions.

## Run on the target smartboard

Record model, host OS, browser version, display resolution and scaling. In Battle,
hold two then four fingers simultaneously on the touch-check pad. Verify lane
capacity reflects observed contacts and available logical width. Play both Duel
and four-player Battle: concurrent releases, crossing fingers between lanes,
cancel/lift interruptions, resize/fullscreen during flight, sudden death, result
rewards and repeated exit/re-entry. Verify mouse/one-contact input stays in relay.

Measure frame timing with the board's actual GPU during four active lanes and
effects. Record the observed frame-rate distribution, input responsiveness and
audio behavior. Desktop headless Chrome timings cannot certify this hardware.
