# Plus Store — Apple signing validation / مسار التحقق من التوقيع

**Current status:** code for metadata preflight only. NO IPA has been signed, NO Apple identity or provisioning profile has been provided or verified, and NO device install has been tested.

## 1. Preconditions (only apps you own or are authorized to distribute)
- A Mac with current Xcode Command Line Tools and access to an Apple Developer team.
- An authorized iOS app built from owned source code; an IPA alone does not establish distribution rights.
- An Apple signing certificate and its corresponding private key **in the Mac keychain**, not in GitHub, ChatGPT, or site uploads.
- Matching Apple-signed provisioning profile, app Bundle ID, team ID, appropriate entitlements, unexpired credentials.
- For Ad Hoc, register the target test device UDID in the Apple Developer team and include it in the profile. Ad Hoc is for registered devices, not unrestricted commercial public distribution.
- Use App Store Connect / Apple-supported distribution where applicable. Enterprise distribution must only be used for the organization's internal users and apps.

## 2. Read-only validation on a trusted Mac
Run locally on the Mac; NEVER paste private keys, certificate passwords or full provisioning profiles into this chat.

```bash
# List available code signing identities, without exporting private keys.
security find-identity -v -p codesigning

# Inspect Apple-signed provisioning profile (read-only).
security cms -D -i /path/to/Authorized.mobileprovision > /tmp/plus-profile.plist
plutil -p /tmp/plus-profile.plist

# Inspect app inside an IPA safely, e.g. via Finder archive extraction
# into a temporary directory on the trusted Mac.
# Then check the app metadata and original signature:
plutil -p /path/to/Payload/OwnedApp.app/Info.plist
codesign --display --verbose=4 /path/to/Payload/OwnedApp.app
codesign --verify --deep --strict --verbose=2 /path/to/Payload/OwnedApp.app
```

The `security cms` step verifies/decodes a signed CMS container; further validation must confirm Apple trust, profile identity and eligibility. Do not assume that readable plist data proves authorization.

## 3. Signing test on a trusted Mac
For a reliable first real test, create a simple owned example app in Xcode, select a permitted signing mode (e.g. registered test device / Ad Hoc), and use Xcode **Product → Archive → Distribute App**. Xcode manages nested code signatures, entitlements, profiles, and export. Inspect and verify the exported app with `codesign --verify`, then install and launch it on an eligible test device. Keep device logs as evidence.

If building an automated signing service later, the signing worker must be a private, access-controlled Mac runner with keychain access, restricted input and artifact handling, validated Apple teams and permissions, job isolation, audited operations, and no certificate/key disclosure. A Linux/Render static site cannot perform Apple-supported iOS signing with only the existing source files.

## 4. Automated metadata preflight
The pure JavaScript checks live at `signing/preflight.js`, tested with `npm test`. It deliberately returns `preflight_passed_not_signed` instead of 'success'. Metadata supplied by a customer is *not trusted evidence* of a signed Apple profile or valid IPA. A real server must derive information from verified files and trusted Apple APIs, not accept client claims.

## 5. Acceptance criteria before saying signing works
1. Verified ownership and authorized distribution route.
2. Apple profile and certificate cryptographically verified on an isolated Mac.
3. App ID, team, entitlements, profile, certificate, and allowed device matching.
4. Xcode archive/export produces an IPA without errors.
5. Post-export signature verification passes.
6. Install + launch succeeds on a supported iPhone under the selected distribution route.
7. Logs and outputs are reviewed without recording private keys or UDIDs in public repositories.

Until all seven criteria are evidenced, Plus Store signing must remain **not active**.

Apple documentation:
- https://developer.apple.com/help/account/provisioning-profiles/create-an-ad-hoc-provisioning-profile
- https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices
- https://developer.apple.com/library/archive/technotes/tn2319/
