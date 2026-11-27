# Chrome Web Store Publication Guide

Use this document to update the published item to version 0.3.0 manually. Upload only the exact ZIP produced by `npm run release:chrome`. Do not upload `dist/`, the repository, a source ZIP from GitHub, or the `.sha256` file.

## 1. Prepare the public source and privacy URL

Before opening the Developer Dashboard:

1. Review and publish the current source changes to the GitHub repository:

   ```powershell
   git status
   git diff --check
   git add .github AGENTS.md PRIVACY.md README.md STORE_LISTING.md icons manifest.json package.json scripts src tests
   git commit -m "fix: bootstrap open WhatsApp tabs after installation"
   git push origin main
   ```

2. Open the pushed commit on GitHub and wait for the **Verify extension** workflow to pass.
3. Open the public privacy policy and confirm it renders without signing in:
   `https://github.com/nvn01/drag-and-drop-whatsapp-sticker-web-extension/blob/main/PRIVACY.md`
4. Confirm that the page includes the August 24, 2026 effective date, local image-handling disclosure, and Limited Use statement.
5. Keep that URL available for the Privacy tab.

Do not submit while the public policy is older than the uploaded package's behavior.

## 2. Verify the release files

Run:

```powershell
npm run release:chrome
Get-FileHash .artifacts\whatsapp-sticker-plugin-0.3.0.zip -Algorithm SHA256
Get-Content .artifacts\whatsapp-sticker-plugin-0.3.0.zip.sha256
```

The two SHA-256 values must match. Keep both files unchanged after verification. Upload this file:

```text
.artifacts/whatsapp-sticker-plugin-0.3.0.zip
```

The passing GitHub workflow also uploads the inner ZIP and `.sha256` file as one workflow artifact. If you download that artifact, extract its outer wrapper, compare the inner ZIP checksum to your local value, and upload the inner extension ZIP—not the GitHub artifact wrapper.

## 3. Finish account checks

In the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole):

1. Open **Account**.
2. Confirm the developer contact email says **Verified** and is actively monitored.
3. Confirm 2-Step Verification is enabled on the Google account.
4. Complete the trader/non-trader declaration accurately for your situation.
5. Confirm the public publisher name is the name you intend users to see.
6. Add your own Google account under **Trusted testers** if you will use the recommended private-test path.

Do not claim that Google, Chrome, WhatsApp, or Meta has certified or endorsed the extension.

## 4. Update the existing item and upload the ZIP

1. Open the existing **Drop as Sticker for WhatsApp Web** item.
2. Open **Package**.
3. Click **Upload new package** and choose `.artifacts/whatsapp-sticker-plugin-0.3.0.zip`.
4. Complete the dashboard's pre-submission installation checks.
5. Confirm the parsed version is `0.3.0` and there are no manifest warnings.
6. If the dashboard rejects the package, fix the source, increment the manifest version, rebuild, and upload the new version. Never alter the verified ZIP manually.

## 5. Complete Store Listing

Use English as the default language and **Productivity** as the primary category.

**Name**

```text
Drop as Sticker for WhatsApp Web
```

**Summary**

```text
Drop one image into WhatsApp Web and open the native sticker editor instantly.
```

**Detailed description**

```text
Create WhatsApp stickers with fewer clicks. Open a chat in WhatsApp Web, drag in one supported image, and Drop as Sticker opens WhatsApp's native sticker editor. Review or edit the sticker, then press Send yourself.

Open the toolbar settings to enable or disable sticker creation, paste imports and GIF/video conversion, or save optional pack and author metadata. When it is off, WhatsApp's normal drag-and-drop behavior is restored. Unsupported, ambiguous, and multi-file drops also retain WhatsApp's normal behavior.

Privacy: the extension handles only the file or direct link you deliberately drop or paste. It processes that image locally in your browser and passes it to WhatsApp Web's existing editor for this feature. The developer does not receive the image. There are no ads, analytics, telemetry, or extension-owned servers.

This extension is unofficial and is not affiliated with, authorized by, or endorsed by WhatsApp or Meta. WhatsApp Web changes may temporarily affect compatibility.
```

**URLs**

- Homepage URL: `https://github.com/nvn01/drag-and-drop-whatsapp-sticker-web-extension`
- Support URL: `https://github.com/nvn01/drag-and-drop-whatsapp-sticker-web-extension/issues`
- Official URL: leave blank unless you own a domain and have verified it through Google Search Console.

## 6. Prepare and upload graphic assets

Required assets:

- Store icon: use `icons/active-128.png` from the source tree.
- Screenshot: at least one `1280 x 800` PNG or JPEG; up to five are allowed.
- Small promotional tile: one `440 x 280` PNG or JPEG.
- Marquee promotional tile: optional `1400 x 560` PNG or JPEG.
- YouTube demo: optional unless the dashboard explicitly marks it required for the current form.

Create a new privacy-safe screenshot; do not use development screenshots that show real contacts, messages, phone numbers, notifications, profile photos, or browser-account details.

Recommended screenshot process:

1. Open a self/test chat and remove or hide personal conversation content.
2. Use a generated non-sensitive image.
3. Capture the green **Drop to create sticker** state or the native sticker editor before sending.
4. Crop to exactly `1280 x 800` without browser profile UI.
5. Inspect the final image at full size for personal data before uploading.

The promo tile should use the original extension logo and a simple visual of an image moving into a sticker outline. Do not use WhatsApp's logo, the WhatsApp name as dominant branding, fake ratings, awards, or an endorsement badge.

## 7. Complete Privacy

**Single purpose**

```text
Prepare one deliberately dropped or pasted media item and route it into WhatsApp Web's existing sticker editor.
```

**Permission justification: storage**

```text
Stores the enabled, paste and motion switches plus optional pack name and author on the device. It is not synchronized to an extension-owned server.
```

**Permission justification: scripting**

```text
Injects only the packaged extension runtime into an already-open WhatsApp Web tab after a fresh installation. It does not inject arbitrary code, download code, or read messages, contacts, cookies, or authentication storage.
```

**Host permission and website/content-script access justification**

```text
Runs only on https://web.whatsapp.com/* to detect the user's image drop, route that image into WhatsApp Web's existing sticker editor, and initialize an already-open WhatsApp Web tab immediately after a fresh installation. The extension does not run on or request access to other sites.
```

**Remote code**

Select **No, I am not using remote code**.

Reviewer explanation if a text field is available:

```text
All extension JavaScript is packaged in the uploaded ZIP. The extension does not fetch or evaluate executable code. Its page adapter interoperates only with functions already loaded by WhatsApp Web so it can invoke the site's existing dropped-image normalizer and native sticker editor.
```

**User data categories**

Select:

- **User-generated content** — the media or link the user deliberately drops or pastes, and optional pack or author text supplied in settings.
- **Website content** — only when the dropped image originates from a webpage and is normalized for the same user-requested sticker action.

Disclose the optional author field in the privacy questionnaire. Users can enter their own name.

For data use, certify truthfully that:

- data is used only for the extension's disclosed single purpose;
- data is not sold or used for advertising, creditworthiness, or lending;
- humans do not read the handled data;
- the extension follows the Chrome Web Store User Data Policy and Limited Use requirements.

**Privacy policy URL**

```text
https://github.com/nvn01/drag-and-drop-whatsapp-sticker-web-extension/blob/main/PRIVACY.md
```

Make sure the dashboard disclosure, detailed description, and public policy all say the same thing: the image is handled locally for the requested feature, passed to WhatsApp Web, and never received by the developer.

## 8. Complete Test instructions

**Credentials**

```text
No extension account or credentials are required. The reviewer may use their own WhatsApp Web account and a self/test chat. The publisher cannot and does not provide WhatsApp credentials.
```

**Instructions**

```text
1. Open https://web.whatsapp.com/ and sign in using your own test account.
2. Open a self/test chat in which messages can be sent.
3. If WhatsApp Web was already open when the extension was installed, do not refresh it. Drag one PNG, JPEG, or WebP file over the active conversation and confirm the extension's green drop affordance appears immediately.
4. Drop the file. Confirm WhatsApp's native sticker editor opens. Sending is not required; close the editor without sending.
5. Open the extension toolbar panel and switch off Enable extension. Confirm the icon changes to the gray inactive version with an X.
6. Drag another image. Confirm the extension does not intercept it and WhatsApp's normal media flow remains available. Close the preview without sending.
7. Use Enable extension in the toolbar panel to restore sticker mode.

The extension contains no account system, payment, remote service, analytics, or auto-send function. All executable extension code is in the submitted package. The extension is unofficial and interoperates with WhatsApp Web's existing page-loaded editor; it does not modify WhatsApp authentication data.
```

## 9. Choose Distribution

Recommended first-release path:

1. Select **Private** visibility and **Only trusted testers**.
2. Select the regions where your tester account is located; **All regions** is acceptable if you intend a global public release.
3. Declare that there are no in-app purchases.
4. Submit this private version for review.
5. After approval, install the store-signed item using the trusted-tester account and repeat the Chrome and Brave smoke tests.
6. Return to **Distribution**, change visibility to **Public**, save, and submit it for the required public review.

All visibility types undergo policy review. The private-first route adds a review cycle but lets you validate the store-signed package before public launch. If speed matters more, choose **Public** immediately and use deferred publishing in the next step.

## 10. Submit with deferred publishing

Before clicking **Submit for review**, confirm:

- Package shows version `0.3.0`.
- The public privacy-policy URL works in a signed-out window.
- Store copy and privacy answers match.
- Screenshot and promo tile contain no private data or misleading affiliation.
- Test instructions work without credentials from you.
- The ZIP checksum still matches the `.sha256` sidecar.

Then:

1. Click **Submit for review**.
2. In the confirmation dialog, turn off automatic publishing so the approved submission is staged for manual publication.
3. Confirm submission.
4. Watch the verified contact email and the dashboard status for review questions or rejection details.
5. If you find a defect while review is pending, use **Cancel review**, fix it, increment the version, rebuild, and submit the new ZIP.
6. After approval, run the final appropriate smoke test and click **Publish** within the dashboard's staged-publication window.

## 11. Post-publication checks and rollback

After the item is public:

1. Open the public listing in a signed-out window.
2. Verify the publisher name, screenshots, privacy link, support link, and unofficial disclaimer.
3. Install from the Web Store in current Chrome and Brave.
4. Verify active image drop, inactive native pass-through, toolbar icon state, persistence after reload, and no auto-send.
5. Record the Web Store item ID, public URL, published version, publication date, and local ZIP SHA-256 in the release notes.

Rollback triggers:

- inactive mode blocks or changes WhatsApp's native drop behavior;
- supported drops no longer open the editor;
- the extension sends without a separate user action;
- a permission, privacy disclosure, or packaged-content mismatch is discovered;
- a WhatsApp compatibility change creates data-loss or account-risk behavior.

For a serious regression, unpublish the affected item or submit a higher patch version that defaults safely to inactive. Never upload a modified ZIP under the same version.

## 12. Optional update-key protection

After the first release, the **Package** tab may offer **Verified CRX Uploads**. This can protect future updates if the developer account is compromised, but opting in makes the signing key mandatory for every later update.

Use it only after you have an offline key-backup plan. Never commit the private key, upload it to GitHub, keep it in the project directory, or store the only copy in the same Google account. Losing the key requires Chrome Web Store support before another update can be published.

## Official references

- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish/)
- [Prepare your extension](https://developer.chrome.com/docs/webstore/prepare)
- [Complete the listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Supply images](https://developer.chrome.com/docs/webstore/images)
- [Fill out privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy/)
- [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Limited Use policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
- [Set visibility and distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)
- [Review process](https://developer.chrome.com/docs/webstore/review-process)
- [Update or roll back an item](https://developer.chrome.com/docs/webstore/update)
