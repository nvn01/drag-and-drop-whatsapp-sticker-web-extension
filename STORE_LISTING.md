# Chrome Web Store Release Sheet

This document is the ready-to-copy store listing and submission checklist for version 0.2.0. Do not submit until the verified Web Store contact email and final screenshots are ready.

## Listing copy

**Name:** Drop as Sticker for WhatsApp Web

**Summary:** Drop one image into WhatsApp Web and open the native sticker editor instantly.

**Detailed description:**

Create WhatsApp stickers with fewer clicks. Open a chat in WhatsApp Web, drag in one supported image, and Drop as Sticker opens WhatsApp's native sticker editor. Review or edit the sticker, then press Send yourself.

Use the toolbar icon to turn the extension on or off at any time. Unsupported, ambiguous, and multi-file drops retain WhatsApp's normal behavior.

The extension has no ads, analytics, telemetry, or external server. It is unofficial and is not affiliated with, authorized by, or endorsed by WhatsApp or Meta.

## Privacy dashboard answers

- **Single purpose:** Route one user-dropped image into WhatsApp Web's existing sticker editor.
- **Permission justification - storage:** Store only the local boolean on/off preference.
- **Site access justification:** Run the user-triggered drop adapter only on `https://web.whatsapp.com/*`.
- **Remote code:** No. All executable code is packaged in the extension ZIP.
- **Data collection/use:** None. Image bytes are not collected by the extension and are passed locally to WhatsApp's existing editor.
- **Data sale, advertising, credit, or lending use:** None.
- **Privacy policy URL:** Publish `PRIVACY.md` at a stable public HTTPS URL and enter that URL before submission.

## Reviewer test instructions

1. Sign in to WhatsApp Web and open a self/test chat.
2. Drag one PNG, JPEG, or WebP file over the active conversation and confirm the branded drop status appears.
3. Drop the file and confirm WhatsApp's native sticker editor opens.
4. Close the editor without sending.
5. Click the extension toolbar icon; confirm it changes to the inactive icon with an X.
6. Drag another image and confirm WhatsApp's normal media flow is unchanged.
7. Click the icon again to restore sticker mode.

## Required assets and account steps

- [x] Packaged PNG extension icons: 16, 32, 48, and 128 pixels.
- [ ] At least one privacy-safe 1280 x 800 or 640 x 400 product screenshot.
- [ ] Optional 440 x 280 small promotional tile.
- [ ] Monitored contact email verified in the Chrome Web Store developer account.
- [ ] Chrome Web Store developer account registered, agreement accepted, one-time registration fee paid, and contact email verified.
- [ ] Publisher name chosen carefully and public developer profile completed.
- [ ] ZIP from `npm run release:chrome` uploaded; Store Listing, Privacy, and Distribution tabs completed.
- [ ] Submission reviewed in preview, then explicitly approved by the owner before **Submit for review**.

## Distribution notes

The ZIP is usable as an unpacked extension in Chromium browsers. Public listings are vendor-specific. Chrome Web Store publication does not automatically publish to Microsoft Edge Add-ons, and other Chromium browsers may use their own policies or stores.

Official references: [register a Chrome Web Store developer account](https://developer.chrome.com/docs/webstore/register), [set up the account](https://developer.chrome.com/docs/webstore/set-up-account), [prepare the extension](https://developer.chrome.com/docs/webstore/prepare), [publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish), [privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy/), and [image requirements](https://developer.chrome.com/docs/webstore/images).
