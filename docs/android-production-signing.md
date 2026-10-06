# Production Android signing

The installed v1.1.0 APK uses com.getqueuedrop.printbridge. Its original signing key is required for an in-place update. Do not commit a keystore, passwords, or a base64 key to this repository.

Configure repository Actions secrets in Settings → Secrets and variables → Actions:
- ANDROID_KEYSTORE_BASE64: base64 encoding of the original keystore
- ANDROID_STORE_PASSWORD
- ANDROID_KEY_ALIAS
- ANDROID_KEY_PASSWORD

Run Signed Production APK on main. It tests release code, aligns and signs v1.1.1, verifies its certificate against the existing v1.1.0 APK, checks application ID and increasing version code, and uploads queuedrop-production-signed.

A missing secret or different certificate blocks publication. If the original debug signing key has been lost, a new durable release key requires a planned uninstall/reinstall; it cannot update existing installations directly. Keep a secure backup of the key.

After all checks pass, the workflow commits the signed APK, checksum, source manifest, and production settings link together to main. A concurrent main update rejects the push rather than overwriting it. Verify the deployed download checksum and an actual installed-device upgrade before retiring v1.1.0.

SMS remains paused and is outside this maintenance change.
