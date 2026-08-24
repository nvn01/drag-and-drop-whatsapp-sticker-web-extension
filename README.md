# Drop as Sticker for WhatsApp Web

An unofficial Chromium extension that turns a single image drop in an active WhatsApp Web conversation into WhatsApp's native sticker-editor flow.

The extension does not send automatically. After dropping an image, review it in WhatsApp's editor and press Send yourself.

## What it does

1. Detects one eligible image dropped into an active WhatsApp Web chat.
2. Lets WhatsApp normalize local files and browser-page image drags.
3. Routes the resulting `File` through WhatsApp's hidden Create Sticker input.
4. Opens the native sticker editor without opening File Explorer.
5. Lets you turn interception on or off by clicking the extension toolbar icon.

Unsupported, ambiguous, and multi-file drops are left to WhatsApp's normal behavior.

## Privacy and permissions

- Runs only on `https://web.whatsapp.com/*`.
- Uses `storage` to remember the on/off preference. `activeTab` and `scripting` synchronize only the current WhatsApp tab when you click the toolbar icon, including after an extension update.
- Requests no broad host permissions and cannot inject this synchronization into tabs you did not activate by clicking the icon.
- Has no analytics, extension-owned network requests, or external server.
- Does not inspect messages, contacts, authentication state, or browser history.
- Does not persist dropped files or URLs.
- Handles the deliberately dropped image only inside the browser for the stated sticker-editor purpose; the developer never receives it.

The toolbar preference is the only value stored by the extension: `enabled: true` or `enabled: false`.

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

Click the toolbar icon at any time to switch between active and inactive mode. The inactive icon includes an **X**, and WhatsApp's normal drag-and-drop behavior is restored without reloading the page.

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
