# CivicRide — Admin, Safety and Mobile Upgrade

> **Fixed build:** see [CHANGES.md](CHANGES.md) for the driver-document / admin-approval fixes. Admin approvals now use a
> secure in-page document viewer and Socket.IO live updates (with a 30-second safety refresh).

CivicRide is a React/Vite + Express/Mongoose starter with passenger, driver and admin workflows. This archive adds:
- Socket.IO realtime events for admin dashboard updates when driver documents or vehicle details change (the admin manual “Refresh data” control is removed). The dashboard now reloads when the server emits a change event rather than relying on an 8-second polling timer.
- A rider/driver contact centre with MongoDB-persisted ride chat and browser audio/video calling via WebRTC signalling. Chat/call access is restricted to the passenger and assigned driver on the same ride.

- Admin dashboard APIs for users, rides, driver decisions, and SOS/incident review.
- Driver document intake to **private/authenticated Cloudinary storage**; upload endpoint accepts JPG/PNG/PDF up to 8 MB.
- A hard approval gate: admin cannot approve a driver until identity, licence, vehicle registration, insurance and roadworthiness documents have individually been marked approved.
- Driver GPS reporting during active trips, limited trip-sharing links, SOS incident records, and OpenStreetMap links for operations.
- Flutterwave transaction verification and webhook signature checking using `FLW_WEBHOOK_SECRET_HASH`.
- Helmet security headers, origin allow-list CORS and stricter authentication rate limits.
- Capacitor setup for Android/iOS, PWA manifest, SVG app icon and splash-screen artwork.

**Honest production status:** this is a production-oriented foundation, not a certified or launch-ready transportation service. It has not been end-to-end tested against your live provider accounts, real devices, or deployed infrastructure. The dependency installation/build could not be verified in the packaging environment because npm installation timed out. Install dependencies on your PC and run the build checks below before deployment. Do not carry real passengers or money until the checklist below is completed and tested.

## A. Windows local setup

Install Node.js 20 LTS or newer, Git (optional), and VS Code. Extract this archive to a folder such as `C:\Users\Owner\Documents\CivicRide-Advanced`.

### 1. MongoDB Atlas

1. Create a project and cluster at https://www.mongodb.com/atlas.
2. Create a database user with a strong password; use a database-specific user, not an Atlas account password.
3. Add your current development IP under Network Access. For production, allow only the required deployment egress IPs where possible; do not leave `0.0.0.0/0` enabled as a permanent shortcut.
4. Copy the Node.js connection string and replace username/password/database name. URL-encode special characters in the password.

### 2. Backend

Open a terminal:

```bat
cd C:\Users\Owner\Documents\CivicRide-Advanced\server
copy .env.example .env
npm install
```

Edit `server\.env`. Minimum settings:

```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
PUBLIC_APP_URL=http://localhost:5173
MONGODB_URI=mongodb+srv://.../civicride
JWT_SECRET=replace_with_a_random_secret_at_least_32_characters
BREVO_API_KEY=your_real_brevo_key
BREVO_SENDER_EMAIL=your_verified_sender_email
BREVO_SENDER_NAME=CivicRide
```

Generate a secret in PowerShell with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Paste its output as `JWT_SECRET`. Never share or commit `.env` files. Then run:

```bat
npm run dev
```

API health check: http://localhost:5000/api/health

### 3. Email verification

Create a Brevo account, verify a sender address/domain, create an API key, and set `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `BREVO_SENDER_NAME`. The account address receiving an OTP can be `ramatechcode14@gmail.com`; the sender must be a verified sender in Brevo. Test email delivery and spam filtering before launch.

### 4. Frontend

Open a second terminal:

```bat
cd C:\Users\Owner\Documents\CivicRide-Advanced\client
copy .env.example .env
npm install
```

Set `VITE_API_URL=http://localhost:5000/api`. Set `VITE_GOOGLE_CLIENT_ID` only if you configure Google OAuth; the email/password flow is separate. Then:

```bat
npm run dev
```

Open http://localhost:5173. Keep both terminals running.

### 5. Create your admin account

1. Register `ramatechcode14@gmail.com` through the app and complete email OTP verification.
2. In a terminal at the `server` directory, run:

```bat
node scripts/promote-admin.js ramatechcode14@gmail.com
```

3. Sign out and sign in again. If it says no account found, registration did not save to this same MongoDB database or the email differs. Confirm the `MONGODB_URI` used by the running server and script is identical.
4. Admin role is assigned by this private script, never by a browser form. Keep database credentials and the script private.

## B. Driver verification and private documents

Create a Cloudinary account at https://cloudinary.com. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in `server/.env`; restart the API. The upload endpoint stores documents as authenticated assets rather than public uploads. Keep the Cloudinary secret server-side only.

A driver must upload each of these five documents: identity, driving licence, vehicle registration, insurance, and roadworthiness. An admin must review each document and mark it approved before approving the driver. This is a workflow gate, not automatic verification of authenticity. A trained reviewer must inspect the actual private file through your Cloudinary account and record the decision; do not approve a document based only on its filename. Add signed, short-lived admin document-preview URLs and malware scanning before a broad public launch.



### Cloudinary setup (step by step)
1. Create/sign in to https://cloudinary.com and open the Cloudinary Console.
2. From the Dashboard, copy the **Cloud name**, **API Key**, and **API Secret**. The API Secret must never go in a `VITE_` frontend variable, a screenshot, a public repository, or a message.
3. Open `server/.env` and set:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

4. Restart the backend after saving `.env`. The app sends driver documents through the API and stores them as authenticated/private Cloudinary assets. Documents are limited to JPG, PNG or PDF, maximum 8 MB.
5. Sign in as a driver and upload each required document. Sign in as an admin and open **Driver approvals**; the dashboard should update automatically when the server emits the upload event. Admins can request a short-lived private document URL to review a file.
6. In Cloudinary, verify that uploaded documents use the authenticated delivery type. Do not change the folder to public or expose `secureUrl` links publicly. Set retention/deletion policy and restrict Cloudinary Console access for production.
7. If uploads return a configuration error, check the three variable names, Cloudinary account credentials, server logs, and restart. If a file uploads but preview fails, verify the asset's resource type (`image` for JPG/PNG, `raw` for PDF) and authenticated delivery settings.

### Realtime chat and calls
- After signing in, choose **Call & chat** at the bottom of the page and select a ride with an assigned driver. Chat history is saved in MongoDB. Only the passenger and assigned driver can read or send messages for that ride.
- Audio/video calling uses WebRTC; Socket.IO carries authenticated signalling only, while media travels peer-to-peer when the network allows it. Test with two separate accounts/devices and grant microphone/camera permissions.
- Browser microphone/camera access generally requires `localhost` during development and **HTTPS** on deployed domains. Configure `CLIENT_URL` with every exact frontend origin and `VITE_API_URL` to the HTTPS API URL in production. Ensure your host supports persistent WebSocket connections.
- The starter uses a public STUN server, which does **not** guarantee calls will connect across every mobile carrier, office firewall, or symmetric NAT. For reliable production calling, configure a TURN relay (for example, a managed WebRTC provider or your own secured Coturn service), use authenticated short-lived TURN credentials, and add the TURN URLs/credentials to the `iceServers` list in `client/src/ContactCenter.jsx`. Never publish long-lived TURN credentials in a public repo.
- Keep the API and frontend origins aligned. Admin updates use Socket.IO events; there is no admin “Refresh data” button. If realtime updates do not arrive, check the browser console/network WebSocket connection, `CLIENT_URL`, matching auth role, and that both clients are connected to the same deployed API.
- Calls are browser-to-browser contact features, not a connection to the public telephone network. Calling an ordinary phone number would require a separate telephony provider and regulatory/consent setup.

## C. Payments — Flutterwave

1. Start with Flutterwave test keys and test transactions only.
2. Set `FLW_SECRET_KEY` to the **secret** test key in the server environment. Never use it in `client/.env`.
3. Configure the Flutterwave webhook URL as `https://YOUR_API_DOMAIN/api/payments/webhook` and set the same webhook secret hash in `FLW_WEBHOOK_SECRET_HASH` as configured in Flutterwave.
4. Confirm the exact webhook header/signature format against the current Flutterwave dashboard/docs before enabling live mode. The route rejects requests without the configured `verif-hash` value and independently calls transaction verification.
5. Test successful, failed, abandoned, duplicate and delayed callbacks; confirm amount, currency, ride ID and transaction reference match. Reconcile payments from provider records. Do not treat a browser redirect as proof of payment.
6. Switch to live credentials only after the provider has approved the business and the full sandbox test suite passes.

Cash rides remain a separate payment path. The current fare calculation is still a fixed category estimate; implement a real routing provider and server-calculated distance/time fare before charging passengers.

## D. Tracking, trip share and SOS

- Drivers report location only while they have an active trip and grant location permission. Browser geolocation stops when the app/browser is backgrounded or closed; this is **not** continuous background tracking.
- Trip share links expose limited trip status, pickup/destination and recent driver location to anyone holding the link. Treat the link as a bearer secret. Add expiration/rotation, explicit consent, abuse monitoring, and a tested mobile share sheet before launch.
- SOS creates an incident record visible in Admin → SOS / Incidents. It does **not** automatically call police, ambulance, or emergency dispatch. Establish a staffed escalation process and local emergency-service integration before presenting it as emergency response.
- Admin operations currently show driver GPS coordinates and an OpenStreetMap link, not a continuously updating multi-marker map. For a true live map, implement a map SDK, WebSocket/SSE updates, stale-location indicators, and strict role-based location access.

## E. Android and iOS app builds

The app is configured for Capacitor. From `client` after `npm install`:

```bat
npm run build
npm install @capacitor/android
npx cap add android
npx cap sync android
npx cap open android
```

Install Android Studio and Android SDK, configure app ID/package name, app name, permissions, signing key and release build. Do not commit signing keys. On Windows you can build Android; final iOS builds require a Mac with Xcode (or a trusted macOS CI build service).

For iOS, on macOS:

```bash
cd client
npm install
npm run build
npm install @capacitor/ios
npx cap add ios
npx cap sync ios
npx cap open ios
```

Before deployment, run `npm install` in both `server` and `client`, then run `npm run build` from `client`. Run a two-account chat/call test and confirm automatic admin updates before release. Before either store submission, verify location permission prompts and background-location declarations, privacy labels, screenshots, icon/splash assets, deep links, offline/error states, and app-store policies. A Capacitor wrapper does not itself provide native background tracking; use a reviewed native plugin and platform-specific permission/configuration if you genuinely need it.

## F. Deploy to production

A practical deployment split is:

- Frontend: Render Static Site, Vercel, or Netlify.
- API: Render Web Service or another managed Node host.
- Database: MongoDB Atlas.
- Documents: Cloudinary authenticated assets or private S3-compatible storage.
- Maps: select a licensed provider and configure billing/quotas; OpenStreetMap data and tile-service usage policies still apply.

### Deploy the API

1. Push the project to a private Git repository; ensure `.env`, database dumps, credentials and signing keys are ignored.
2. Create a Node web service with root directory `server`, build command `npm install`, start command `npm start`.
3. Add all server environment variables in the host dashboard: production `NODE_ENV`, `PORT` as required by host, `CLIENT_URL` set to your exact HTTPS frontend origin(s), `PUBLIC_APP_URL`, `MONGODB_URI`, `JWT_SECRET`, Brevo, Cloudinary and Flutterwave settings.
4. Restrict CORS to exact production frontend origins. Confirm `/api/health` returns success and logs contain no secrets or personal documents.
5. Add a custom API domain and verify TLS/HTTPS.

### Deploy the frontend

1. Create a static site with root directory `client`, build command `npm install && npm run build`, publish directory `dist`.
2. Set `VITE_API_URL=https://YOUR_API_DOMAIN/api`. Set the public Google client ID only if Google login is configured.
3. Add SPA rewrite rules so `/share/<token>` serves `index.html`.
4. Add the production frontend domain to server `CLIENT_URL` and Google OAuth origins; redeploy the API.
5. Test from a different device/network, not only localhost.

### Production checklist — do not skip

- [ ] Build succeeds on clean CI and dependencies are audited; pin and review dependency updates.
- [ ] HTTPS, secure secrets, exact CORS, request validation, rate limits, structured logs, monitoring and alerts.
- [ ] Password reset, session revocation/refresh strategy, suspicious-login controls and secure session storage; current frontend stores JWT in localStorage, so mitigate XSS and consider an HttpOnly-cookie/BFF design.
- [ ] Admin MFA, immutable audit trail for driver approvals, document review and incident actions, and least-privilege staff access.
- [ ] Signed temporary document previews, malware scanning, retention/deletion policy and data access logs.
- [ ] Real route distance/duration, dispatch/matching, accurate fare calculation, cancellation/refund rules, receipts and payment reconciliation.
- [ ] Real-time multi-marker map, native background GPS if justified, consent, battery/network testing and stale-location handling.
- [ ] SOS staffed monitoring, escalation contacts, incident response playbook, and explicit statement of what the app can/cannot do.
- [ ] Terms, privacy notice, location consent, data minimisation, retention/deletion process and Nigeria-specific legal/regulatory review.
- [ ] Automated tests for auth/roles, driver approval gates, ride state transitions, race conditions, payment callbacks, share-link privacy and incident permissions.
- [ ] Backups and restore drills, database indexes, uptime monitoring, load testing, disaster recovery and a rollback plan.
- [ ] Real-device Android and iOS tests, store signing, privacy declarations and accessibility review.

## G. Image and map assets

The archive includes editable SVG CivicRide icon and splash artwork under `client/public/`. Driver location links use OpenStreetMap. These assets do not require external stock-image licensing; map tiles and any later photos must follow their provider's attribution and licensing requirements.

## Troubleshooting

- **`No account found` from promote-admin:** register and verify the account first, and make sure script and server use the same `MONGODB_URI`.
- **OTP fails:** check Brevo API key, verified sender, delivery logs and spam folder.
- **Driver can't accept a ride:** account must be approved; production approval requires all five required documents marked approved.
- **Admin clicks View and sees "could not be retrieved":** the file may have been uploaded before the fix or the Cloudinary credentials changed. Ask the driver to upload it again (re-upload replaces the old one). Also confirm the three `CLOUDINARY_*` values and, in Cloudinary Settings → Security, that PDF delivery is not blocked.
- **Admin sees an empty Driver approvals list:** make sure you are on the *Pending* filter only if drivers are pending — choose *All*. Drivers appear after they register with the Driver role.
- **Document upload returns 503:** configure all three Cloudinary variables on the backend and restart it.
- **Frontend API errors after deployment:** check `VITE_API_URL`, HTTPS, CORS allow-list, server logs and Atlas network access.
- **iOS build unavailable on Windows:** use macOS/Xcode or macOS CI.

## Admin user management (added)

The Admin console's **Users** tab supports: approving or rejecting driver applications, suspending accounts, banning accounts, restoring suspended/banned accounts, and permanently deleting non-admin accounts. Suspension and ban status are checked on every authenticated API request, so an existing token does not bypass the restriction. A reason is required for suspension and ban actions. Admin accounts are protected from these actions in this screen to reduce accidental administrator lockout.

Deleting a non-admin account is permanent. Active rides involving that user are cancelled; completed ride and incident history is retained. Before production, add a formal audit log and confirm deletion/retention requirements in your privacy policy.

After replacing/updating the project files, restart the server and client. Existing MongoDB users are treated as active if they do not yet have an `accountStatus` field.


## Driver verification and vehicle details update
- Drivers can save car make, model, year, colour, plate number, vehicle type, seats, and ride category in their dashboard.
- The admin Driver approvals tab now loads the uploaded document metadata, displays vehicle details, and provides View / Approve / Reject controls for each document.
- Document viewing uses a short-lived signed Cloudinary download URL returned only to an authenticated admin. Keep Cloudinary API credentials in `server/.env`; never expose them to the browser.
- Install server dependencies after replacing the project files with `npm install` in the `server` folder.
- Existing driver records may have no vehicle details; drivers should fill and save the new vehicle form. Documents uploaded before this update may need to be re-uploaded if their Cloudinary metadata is incomplete.


## Live admin dashboard and SOS updates
- The Admin Console now calls one combined `/api/admin/dashboard` endpoint rather than firing five independent requests per refresh.
- While the admin page is visible, it checks for new driver documents, updated driver review statuses, rides, users and SOS incidents every 8 seconds; there is also a manual refresh control. This is near-real-time polling, not a WebSocket push connection.
- The SOS / Incidents tab shows the count of unresolved SOS alerts, reporter contact information, the ride route/status, timestamp, and a Google Maps link when the reporter shared GPS coordinates. Open SOS alerts are highlighted.
- The general API rate limit is set to 1,000 requests per 15-minute window to accommodate the consolidated polling flow; authentication has its own stricter 25-request limit. Investigate unusual traffic rather than disabling rate limiting.
- **Emergency limitation:** an SOS is stored in CivicRide and shown to an admin. It does not automatically contact police, ambulance or emergency dispatch, and it must not be marketed as a guaranteed emergency response until a staffed monitoring/escalation workflow is implemented and tested.

## Mobile navigation and role-session troubleshooting (updated 2026-10-26)

- On narrow screens the app uses a fixed, safe-area-aware bottom tab bar (Home, My rides/Admin, Safety, Call & chat), styled like a native Android/iOS app. Desktop navigation remains at the top.
- The frontend now waits for `/api/auth/me` to confirm the server-side role before making role-protected API calls. This avoids stale cached user details triggering `/api/admin/dashboard` with a driver token.
- The mobile web-app capability meta tag is included. Google OAuth provider is no longer wrapped in React StrictMode, avoiding duplicate Google Identity initialization messages during development.
- Socket.IO tries HTTP polling first and then upgrades to WebSocket when available.

### Authentication errors are not bypassed

`POST /api/auth/login` returning `401 Email or password is incorrect` means the submitted email/password does not match an account with a password hash. Use the correct account credentials; do not edit role checks to turn a driver account into an admin. A `403 Not allowed for this account role` means the signed-in account is not an admin according to MongoDB. Sign out, sign in with the real admin account, and verify its `role` in MongoDB. If an account was promoted while logged in, sign out and sign back in so the UI reloads the current role.

### Build locally

```bash
cd client
npm install
npm run build
```

## Advanced booking and live-trip update (2026-10-28)

This revision adds multi-result map search for pickup and destination places, selectable nearby drivers, a searching indicator, ride status/progress cards, vehicle colour and plate visibility, a light/dark preference, a five-item mobile tab bar, and distance estimates from the latest received driver GPS point. A selected driver is saved as `preferredDriver` on the ride and only that driver is notified; without a selection, eligible nearby drivers are notified. The passenger socket joins requested rides so the passenger can receive acceptance/status events in real time.

### Important production notes
- The place search uses the public Nominatim endpoint and the map route uses public OSRM. These public services have usage limits and do not guarantee every house number, business or road is mapped. For production, use a commercial geocoder/routing provider with an API key, usage policy and billing limits.
- The progress bar shows ride state; the numeric distance uses a straight-line estimate from the latest GPS update, not a guaranteed road-distance ETA. Road-based ETA requires a routing provider and regular route recalculation.
- Browser notifications are best-effort only. Notifications when the phone is locked, app is backgrounded or process is terminated require native push notifications (for example FCM/APNs) and native mobile configuration; web notifications alone cannot guarantee delivery.
- Calls depend on the existing WebRTC/contact-centre implementation and working microphone permissions. Reliable calls over carrier/mobile networks usually need a TURN service. Test the incoming call ringtone/answer/reject flow on actual Android/iOS devices before launch.
- Socket events require the app to have a valid session and network access. A selected driver may go offline between discovery and booking; the API returns a conflict so the passenger can choose another driver.
- The project still requires dependency installation and a successful production build on the target Windows machine before deployment.

## Latest interface improvements
- The passenger mobile navigation includes **Activities**, which lists recent rides and their status/payment summary.
- **Settings** provides a persistent light/dark theme toggle, notification permission request and a change-password form. The API verifies the current password and stores only a bcrypt hash of the new password.
- Pickup and destination search is designed for full street addresses, business names, centres and landmarks. For Lagos, enter the full address (for example, `12 Omowunmi Street, Amoshe, Meiran, Alimosho, Lagos`) or use device GPS and select a result from the search list. GPS reverse-geocoding accuracy depends on the map data provider; always verify the selected pin and address.
- When a driver accepts a request, the in-app/browser notification includes vehicle colour, make/model and plate number if the driver's profile contains them.

**Important mobile limitation:** this project currently supports web notifications and a Capacitor wrapper. It does not yet implement an Uber-style native lock-screen Live Activity or guaranteed background push tracking. Those require native Android/iOS notification/background work, a push provider, platform permissions, and real-device testing. Browser notification permission by itself does not guarantee an alert will appear while the phone is locked or the app is force-closed. WebRTC calls likewise require an active app/browser session and configured network/TURN support.
