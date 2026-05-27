# Step 04 - Add QR and PWA Shell Infrastructure

## Goal

Finish the web-platform pieces required for an installable offline-first POS shell before adding more payment flows.

## Scope

- PWA manifest and service worker.
- Offline app shell behavior.
- QR rendering component.
- Mobile POS viewport polish.

## Tasks

1. Add or complete the web app manifest.
2. Add app icons and theme metadata.
3. Register a service worker from the existing app startup path.
4. Cache the application shell for offline reloads.
5. Add a safe offline fallback for navigation requests.
6. Add a reusable QR code component for payment payloads.
7. Replace any pseudo-QR display with the QR component only where the payload already exists.
8. Keep Spark payment creation disabled or mocked when offline.

## Acceptance Criteria

- The app is installable as a PWA in a supported browser.
- The app shell reloads offline after the first successful load.
- QR rendering is reusable for bank and Spark flows.
- The app remains responsive on mobile portrait screens.
- No service worker code stores domain data directly.

## Verification

Run:

```sh
bun run typecheck
bun run check
bun test
bun run build
```

Manual check:

- Load the app once.
- Turn the browser offline.
- Reload and confirm the app shell appears.
- Render an existing QR payload and confirm it is scannable or structurally valid.
