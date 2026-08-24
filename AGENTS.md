# WhatsApp Sticker Plugin

## Project Purpose

- Build a Chromium browser extension that makes sticker creation on WhatsApp Web faster.
- Primary flow: select a chat, drag one image into the conversation, and open WhatsApp's native sticker editor immediately.
- Reuse WhatsApp's existing editor and sticker-send path; do not build a replacement editor or messaging client.

## Current Status

- Version 0.2.0 adds original branding and a persistent one-click active/inactive toolbar toggle.
- Automated policy, build, packaging, fixture, and extension-world checks are available.
- Live Brave inspection confirmed that WhatsApp's hidden image picker opens the sticker editor when its change handler receives a `File`.
- The confirmed internal call uses `stickerMaker: true` and `sendAsSticker: true`.
- Assignment through `DataTransfer` plus a bubbling `change` event works from an isolated content-script world.
- WhatsApp's drag-created `AttachMediaFlow` must close before routing the file to the sticker input.
- The implementation plan is `.plan/first-pass.html`.

## Product Contract

- Version 1 intercepts exactly one supported image dropped into an active, sendable chat.
- A successful drop opens WhatsApp's native sticker editor; the user presses Send.
- Do not auto-send by default. Any future auto-send mode must be explicit, opt-in, and separately approved.
- Non-image, multi-file, ambiguous, and unsupported drops must retain normal WhatsApp behavior.
- If required hooks are missing or ambiguous, fail open and do not block WhatsApp's drop handler.
- Never silently replace, upload, send, or discard user content.

## Technical Direction

- Use Chrome Manifest V3 and support current Chromium desktop browsers, with Chrome and Brave as required smoke-test targets.
- Restrict execution to `https://web.whatsapp.com/*` and the top frame.
- Start capture listeners at `document_start` so they run before WhatsApp's body-level React handlers.
- Keep overlay/status UI isolated; keep capture, normalization, and hidden-input routing in one minimal MAIN-world bridge.
- Keep the toolbar service worker limited to `chrome.action` and the boolean `storage.local` enabled preference.
- Prefer the native hidden `input[type="file"][accept="image/*"]` sticker path over patching WhatsApp commands.
- Use WhatsApp's existing dropped-image normalizer for URL/HTML image drags only when it preserves fail-open behavior.
- Avoid broad host permissions, remote services, runtime-downloaded code, and unnecessary dependencies.

## Expected Structure

```text
manifest.json
src/content-script.js
src/main-world-bridge.js
src/service-worker.js
src/overlay.css
icons/
tests/
scripts/
.plan/first-pass.html
```

## Implementation Rules

- Read `.plan/first-pass.html` before implementing or changing scope.
- Keep edits focused; do not add frameworks or a build system without a demonstrated need.
- Do not depend on generated WhatsApp CSS class names.
- Prefer scoped semantic hooks such as `data-testid`, `aria-label`, element type, and functional attributes.
- Require exactly one matching sticker input inside the active conversation before interception.
- The MAIN-world bridge must validate normalized content and accept only supported `image/*` files.
- The MAIN-world bridge stops the native event only after synchronous preconditions prove it can own the drop.
- Display a small, non-blocking "Drop as sticker" affordance while an eligible image is dragged.
- Remove temporary DOM, object URLs, timers, and listeners during cleanup or extension reload.
- Keep compatibility checks centralized so WhatsApp selector changes require one focused update.

## Privacy and Security

- Process image bytes locally in the browser and pass them only to WhatsApp's existing editor.
- Do not collect messages, contacts, chat names, image contents, browsing history, analytics, or telemetry.
- Do not persist dropped files or image URLs.
- Never log private chat content, contact identifiers, file bytes, tokens, cookies, or session data.
- Never inspect or modify WhatsApp authentication storage.
- Treat page data and dragged HTML as untrusted; never execute markup or remote scripts.
- Keep Content Security Policy strict and never use `eval` or remote executable code.

## Validation

- Add deterministic unit tests for drop classification, file validation, selector health, and fail-open behavior.
- Test PNG, JPEG, WebP, local-file drag, webpage-image drag, text drag, multiple files, and missing-chat states.
- Browser QA must use an authenticated test/self chat and a generated non-sensitive image.
- Opening the sticker editor is allowed during QA; sending a message requires explicit user approval.
- Always close and discard generated previews after a non-send test.
- Verify that unsupported drops still reach normal WhatsApp behavior.
- Run lint, tests, build/package checks, and an unpacked-extension smoke test before release.
- Verify one-click disable/enable behavior, icon state, and persistence before release.

## Release Rules

- Use semantic versions; version 0.2.0 is the first branded public-release candidate.
- Release the same tested artifact; do not rebuild a different archive for publishing.
- Do not publish to the Chrome Web Store, push to a remote, or create a release without explicit approval.
- Document that the extension is unofficial, user-triggered, and not affiliated with WhatsApp or Meta.
- Treat WhatsApp DOM or private-module changes as compatibility incidents; disable interception and fail open until fixed.

## Definition of Done

- One supported image dropped into an active chat opens the native sticker editor without File Explorer.
- No message is sent automatically, no private data leaves the expected WhatsApp flow, and unsupported drops are unchanged.
- Automated checks pass and the behavior is verified manually in both Chrome and Brave.
