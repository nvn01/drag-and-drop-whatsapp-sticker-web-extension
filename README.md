# Drop as Sticker for WhatsApp Web

An unofficial Chromium extension that turns a single image drop in an active WhatsApp Web conversation into WhatsApp's native sticker-editor flow.

The extension does not send automatically. After dropping an image, review it in WhatsApp's editor and press Send yourself.

## What it does

Drop one PNG, JPEG, WebP, GIF, MP4, or WebM into an open chat, or paste a supported file into the message composer. To use a copied image address, paste the direct HTTPS URL on its own. Its path must end in a supported file extension. Links to articles and GIF search pages paste as ordinary text. WhatsApp resolves media links, so the source must allow WhatsApp to read the file. If a site blocks the link, copy or download the file and paste or drop that instead.

Click the extension icon to open settings. **Enable extension**, **Paste to create**, and **Animated stickers** apply immediately. To embed optional pack and author information in the input WebP, enter the values and click **Save attribution**. Save both fields empty to clear them.

GIFs up to 10 seconds and 200 frames and MP4/WebM clips up to 4 seconds convert locally to silent, looping 512 × 512 WebP. Conversion samples motion at up to about 10 frames per second. The source limit is 16 MiB and the converted animation limit is 500 KiB. A red notification reports an import or editor failure. Normal text and multiple files use the ordinary chat flow.

WhatsApp controls the final sticker. Check the native editor preview for motion. The editor can re-encode the input and discard its embedded pack or author. The public pack format documents animated WebP and pack-level publisher metadata. We could not verify a public Web editor API for attaching sound. [WhatsApp sticker format and pack fields](https://github.com/WhatsApp/stickers/blob/main/Android/README.md)

## Privacy and permissions

The runtime runs on WhatsApp Web. The extension stores settings locally, including any pack name and author you choose to share with WhatsApp. Clipboard handling occurs on a paste into the active chat composer. Direct links use WhatsApp's existing media normalizer. The extension has no clipboard-read permission, broad host access, developer-operated server, or analytics. The scripting permission initializes already-open WhatsApp tabs after installation.

## Build and verify

Requirements: Node.js 20 or newer.

```powershell
npm run verify
```

The reproducible unpacked extension is written to `dist/`.

## Install locally

1. Open `chrome://extensions` or `brave://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this project's `dist` directory.
5. Reload an existing WhatsApp Web tab once after installation.

Open the toolbar panel and use **Enable extension** to switch modes. The inactive icon includes an **X**, and WhatsApp's normal drag-and-drop behavior is restored without reloading the page.

After rebuilding an already-loaded copy, click **Reload** on the extension card in
`chrome://extensions` or `brave://extensions`, then reload WhatsApp Web. Chromium
does not hot-reload changed content-script files.

## Safe smoke test

1. Open a self/test chat in WhatsApp Web.
2. Drag one generated, non-sensitive PNG, JPEG, or WebP into the chat.
3. Confirm the native sticker editor opens.
4. Close and discard the preview unless you explicitly intend to send it.
5. Confirm text, documents, and multiple-file drops still use normal WhatsApp behavior.

## Compatibility

This project relies on unsupported WhatsApp Web DOM and module contracts. If those contracts change, interception disables itself or leaves the drop to WhatsApp. It does not patch WhatsApp's send command.

The same Manifest V3 package is intended for Chrome, Brave, Edge, and other Chromium desktop browsers. Store distribution is separate: publishing in the Chrome Web Store does not automatically create an Edge Add-ons or other vendor listing.

## Release package

```powershell
npm run release:chrome
```

This runs every check, builds the exact runtime-only package, writes a versioned ZIP plus a matching `.sha256` sidecar to `.artifacts/`, and prints the checksum. Tests, plans, source logo exports, and repository files are not included in the ZIP.

Public-store copy, permission answers, review instructions, and the remaining account/assets checklist are in [`STORE_LISTING.md`](STORE_LISTING.md). The data-handling statement is in [`PRIVACY.md`](PRIVACY.md).

## Contributing

Tests are intentionally tracked in GitHub because they prove the fail-open, no-auto-send, and permission boundaries. Generated builds, release archives, private environment files, raw logo exports, and local planning files are ignored.

This project is not affiliated with, authorized by, or endorsed by WhatsApp or Meta.
