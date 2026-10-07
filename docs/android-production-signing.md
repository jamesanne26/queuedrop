# QueueDrop Android project location

Android source, Gradle builds, printer unit tests, emulator checks and signed-release preparation have moved to [jamesanne26/queuedrop-automation](https://github.com/jamesanne26/queuedrop-automation). See [Android project instructions](https://github.com/jamesanne26/queuedrop-automation/blob/main/docs/ANDROID_PROJECT.md).

The website repository owns the print-bridge API, kiosk webpage, web/database tests, and approved customer installer files in public/installers/. It does not build Android or run an emulator. Android failures belong to the automation repository and do not attach to website commits.

Download Mobile Installer still points to the approved v1.1.1 production/TEST files. Candidate Android artifacts do not automatically overwrite website installers. Promote only the exact verified signed APK, checksum and source manifest after Android, live-kiosk, real-printer and upgrade checks. Never link customers directly to private GitHub Actions artifacts.

Signing keys and TEST credentials must be configured as secrets in the automation repository; secrets are not copied between repositories. Retain the original package ID and signing certificate for installed-app upgrades. SMS remains paused.
