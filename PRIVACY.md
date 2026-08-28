# Privacy Policy

Effective date: August 24, 2026

Drop as Sticker for WhatsApp Web is a local browser extension. The developer does not collect, sell, share, transmit, or retain personal data through extension-owned systems.

## Data handling

- The extension handles the one image that the user deliberately drops. That user-generated content remains in the browser and is passed only into WhatsApp Web's existing sticker editor to provide the extension's single purpose.
- The developer does not receive the image, operate an image server, keep a copy, provide human access, or use it for analytics, advertising, profiling, or any unrelated purpose.
- The extension does not read or store messages, contacts, chat names, browsing history, authentication data, cookies, or WhatsApp storage.
- The extension does not operate analytics, telemetry, advertising, or an external server.
- The extension stores one local boolean preference named `enabled` so the toolbar on/off choice persists. This value never leaves the browser through extension-owned code.

## Limited Use

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

Any user data handled by the extension is used only to provide its disclosed single purpose. It is not transferred to the developer or to third parties for advertising, data brokerage, creditworthiness, lending, or other unrelated purposes. WhatsApp Web receives the user-selected image only because the user requests the native sticker-editor flow; WhatsApp's own terms and privacy practices apply to that service.

## Permissions

- Site access is limited to `https://web.whatsapp.com/*` so the drop interaction can run in WhatsApp Web and an already-open WhatsApp Web tab can initialize immediately after installation.
- The `storage` permission is used only for the local on/off preference described above.
- The `scripting` permission is used only to inject the extension's packaged files into an already-open WhatsApp Web tab after a fresh installation and to synchronize the preference after a toolbar click. It is not used to download or execute remote code.

## Changes and contact

Material changes to this policy will be published with the corresponding source or store update.

Contact: [open an issue in the project repository](https://github.com/nvn01/drag-and-drop-whatsapp-sticker-web-extension/issues).

This project is unofficial and is not affiliated with, authorized by, or endorsed by WhatsApp or Meta.
