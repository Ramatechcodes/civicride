# CivicRide Advanced — mobile ride upgrade

## Added in this upgrade

- Map-first passenger booking with GPS pickup, map search for pickup/destination, selectable destination pin, nearby online driver markers, and road-route geometry.
- Approved-driver online/offline mode with fresh foreground GPS, vehicle-category matching, a 15 km nearby radius, and targeted Socket.IO ride-request alerts.
- Road-distance/time fare estimation using OSRM when available, with a fallback estimate.
- Active-trip passenger location sharing limited to the assigned ride, driver live-location events, and auto-refreshing trusted trip-share page.
- Driver plate/vehicle details shown to passengers and a map in active driver trips.
- Wallet balance, verified Flutterwave wallet top-up, wallet transaction history, ride coin rewards, online driver count, and admin activity feed.
- Activity records for registration/login, driver online/offline, vehicle/document updates, driver review, ride lifecycle, payment success, and SOS events.

## Important boundaries

- Public OSM/Nominatim and OSRM endpoints are suitable for low-volume development, not guaranteed production SLAs. Configure a supported mapping provider before launch.
- Fare estimates are estimates and can fall back if routing is unavailable; traffic-aware ETA, cancellation fees, driver payout settlement, coin redemption and background GPS are not fully implemented.
- Browser GPS is foreground-only. Reliable native background tracking requires platform-specific work and explicit privacy disclosures.
- Wallet top-ups are credited only after Flutterwave verification. Test with sandbox credentials before using live keys.
- Activity logs are operational summaries, not a full immutable audit system; private message contents and every GPS ping are not logged.

# CivicRide — what was fixed (driver documents → admin approval)

## Root causes found
1. **Admin saw no drivers.** `/api/admin/dashboard` and `/api/admin/drivers` did not return each driver's `role`,
   but the admin screen filtered with `d.role === 'driver'`, so every driver (and the map) was hidden.
2. **PDF documents could not be opened.** PDFs were stored as Cloudinary `raw` files without an extension, then
   downloaded with a `pdf` format that did not match. Files are now stored with a correct public_id and the server
   tries every valid signed-URL form (also works for files uploaded before this fix).
3. **Live updates could be lost.** If a driver uploaded while the admin dashboard was mid-refresh, the update was
   silently dropped. It is now queued and re-run.
4. **Drivers were never told the result.** Approval/rejection only showed after logging out and in again.

## Driver side
- Checklist of the 5 required documents with live status (waiting / approved / rejected + the admin's reason).
- One file per document type: uploading again replaces the old file and sends it for a fresh review.
- Real file-type check on the server (JPG/PNG/PDF by content, not by file name), clear errors for >8 MB or wrong file.
- Upload button shows progress; the file picker resets after upload.
- Receives instant notices (Socket.IO) when a document or the whole application is approved/rejected.

## Admin side
- **Driver approvals** tab: filters (Pending / Approved / Rejected / All), search by name, email, phone or plate.
- Each driver card shows contact details, vehicle details, all 5 documents with status, upload time, file name and size.
- **View** opens the private file in a secure in-page viewer (image or PDF) with Approve / Reject right there.
  The browser never receives a Cloudinary URL; the server streams the file only to an authenticated admin.
- A driver can only be approved when all 5 documents are approved **and** vehicle details are saved; the card says
  exactly what is still missing.
- Rejections require a reason, which the driver sees.
- Rejecting/resetting a document of an already-approved driver moves them back to *pending* automatically.
- Dashboard refreshes on every driver change (Socket.IO) plus a 30-second safety refresh.

## Other fixes
- Flutterwave: added the missing `/api/payments/webhook`, a `/payment-result` handler in the app, and stricter
  amount/currency/reference matching. Accepts `FLW_WEBHOOK_SECRET_HASH` or `FLW_SECRET_HASH`.
- Clear API errors for oversized uploads, bad IDs, duplicate values and validation failures (was "Server error").
- In development, CORS/Socket.IO also accept localhost and Wi-Fi (192.168.x.x) origins so you can test from a phone.
- `config/cloudinary.js` used `require` inside an ES-module project (would crash if imported); fixed.
- Removed the noisy per-request role log.

## Run the automated check
```bat
cd server
npm run test:flow
```
It exercises upload → admin list → view each file → approval gate → approve → reject-reopens (30 checks), using a fake
database and fake Cloudinary, so it needs no credentials.

## Not changed (still needs your attention before real passengers)
See the production checklist in README.md (real route pricing, staffed SOS process, TURN server, legal review).

## October 28, 2026 — passenger experience and account settings
- Added a dedicated Activities mobile tab with a reverse-chronological ride activity list, alongside Home, My rides, SOS, Settings and Call & chat.
- Added working dark/light theme persistence and an account Settings screen with notification permission controls and a secure change-password form.
- Added an authenticated `PATCH /api/auth/change-password` endpoint that verifies the current password, hashes the new password, enforces a 10-character minimum, and records an admin-visible activity event.
- Improved pickup lookup guidance for full street addresses and expanded Nigeria place search results to include more streets, businesses, landmarks and named places.
- Driver-accepted notifications now include the vehicle colour/make/model and plate number when available.
- Clarified that browser notifications cannot guarantee a persistent lock-screen live activity; reliable native lock-screen updates need native mobile/push/background implementation.

**Validation:** backend auth route passes `node --check`; JSX was syntax-transpiled using the locally available TypeScript parser. A full Vite production build could not be completed because `npm ci` timed out in this environment. Run `npm ci` and `npm run build` from `client` on your computer before deploying.


## Follow-up fix: driver availability and navigation
- Going online now checks browser GPS permission, obtains a fresh GPS fix, marks the approved driver online, and immediately posts the location to the server. GPS permission and timeout errors are shown instead of silently ignored.
- Driver GPS continues to refresh while the web app is open and the driver is online. Available ride lists and the driver's ride list refresh every 10 seconds while the app is visible.
- The main bottom tab bar is now visible on desktop and mobile, with Home, Activities, My rides/Admin, SOS, Settings, and Call & chat. Page content has bottom spacing so the fixed navigation does not cover it.
- The passenger empty-state explains that drivers must be approved, online, sharing fresh GPS, and using the same ride category.

### If a driver still does not appear
1. Sign in as an administrator and confirm Driver status is **Approved**.
2. In the driver account, save vehicle make, model, colour, plate number, and the matching ride category.
3. Open CivicRide over HTTPS or localhost, allow location permission, enable device GPS, then tap **Go online to receive trips**.
4. Keep the app tab open; browser geolocation can pause when the app is backgrounded or the phone is locked.
5. On the passenger screen, select the same category as the driver's saved vehicle category and refresh the nearby-driver list.

Build note: `npm run build` could not run in the editing environment because Vite is not installed in the extracted dependencies (`vite: not found`). Run `npm install` in `client` before building.
