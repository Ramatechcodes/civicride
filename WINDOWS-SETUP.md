# CivicRide — Windows setup

## 1. Requirements

- Windows 10/11
- Node.js 20 LTS or newer (includes npm)
- MongoDB Atlas or a local MongoDB instance
- VS Code recommended
- A Cloudinary account for private driver-document storage
- A Brevo verified sender/API key for email OTP

Extract the project folder. The directory should contain `client` and `server`.

## 2. Configure MongoDB and backend

Open CMD in the project directory:

```bat
cd server
copy .env.example .env
npm install
```

Open `server\.env` in VS Code. Configure `MONGODB_URI`, a unique random `JWT_SECRET` (at least 32 characters), `CLIENT_URL=http://localhost:5173`, and `PUBLIC_APP_URL=http://localhost:5173`. Do not paste real credentials into chat or commit `.env`.

Generate a secret in PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

For local development, `DOCUMENT_STORAGE=local` stores documents in a private server folder. Before deployment, configure Cloudinary's cloud name/API key/API secret and set `DOCUMENT_STORAGE=cloudinary`. Never put Cloudinary or payment secrets in frontend `VITE_` variables.

For email verification, configure `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `BREVO_SENDER_NAME`. The sender must be verified with Brevo.

Start the backend:

```bat
npm run dev
```

Check `http://localhost:5000/api/health` returns JSON with `ok: true`.

## 3. Configure and start the frontend

Open a second CMD window from the project directory:

```bat
cd client
copy .env.example .env
npm install
```

Set `VITE_API_URL=/api`. Only configure `VITE_GOOGLE_CLIENT_ID` if you have a Google OAuth web client; email/password OTP is a separate flow.

Start Vite:

```bat
npm run dev
```

Open `http://localhost:5172`. Keep both terminals open. GPS and microphone/camera permissions work on localhost; deployed versions must use HTTPS.

## 4. Create an administrator

1. Register an account in the app and verify its email.
2. In a separate CMD window:

```bat
cd server
node scripts/promote-admin.js your-verified-email@example.com
```

3. Sign out and sign back in so the server issues a token with the admin role.
4. Never expose the promotion script or admin credentials to public users.

## 5. New mobile ride features

- Passenger booking now requests GPS permission, supports pickup/destination lookup with OpenStreetMap/Nominatim, and shows the pickup, destination, nearby eligible drivers and a road-route line on a Leaflet map.
- Drivers must be approved, save their vehicle category and explicitly go online. The app shares foreground GPS while online; only locations refreshed within two minutes are eligible for nearby matching. Driver dispatch filters by category and a 15 km pickup radius.
- The backend attempts OSRM road distance/duration for fare estimates and falls back to a conservative estimate if the public routing service is unavailable. This is not a guaranteed metered fare or traffic-aware ETA; use a contracted routing provider for production.
- Active rides use authenticated Socket.IO rooms for status and location updates. Passenger GPS sharing is limited to an assigned active ride, and trip-share links refresh approximately every 15 seconds. Chat/call access remains restricted to ride participants.
- The admin dashboard includes online-driver statistics, a fresh-location operations map, driver/document approval, user management, rides, SOS incidents and a recorded activity feed. It does not record the content of private chats or store every GPS ping as an audit event.
- Passengers can top up their wallet using Flutterwave. The backend verifies the transaction with Flutterwave before crediting the wallet and keeps a wallet transaction record. Loyalty coins are awarded when a ride completes; they are not cash and have no redemption function unless you implement and publish one.

## 6. Test the ride flow

1. Register a passenger and a separate driver account in two browser profiles/devices.
2. Sign in as the driver, complete vehicle details, upload all five required documents, and keep the app open with GPS permission granted.
3. Sign in as admin and review each private document individually. Only approve documents after actual manual inspection. The backend blocks driver approval until all required document types are approved.
4. Approve the driver. The driver should report foreground GPS while signed in and approved.
5. Sign in as passenger, choose **Use my current location**, enter a destination, choose a category and request a ride.
6. The request should appear only to approved drivers reporting a fresh location within the matching radius and category. The first valid driver to accept claims it.
7. Test ride transitions, trip sharing, SOS, payment sandbox callbacks, and messaging/calling with two accounts. Check browser console and server logs for errors.

## 7. Run checks

Backend syntax check from `server`:

```bat
for %f in (src\server.js src\routes\*.js src\models\*.js src\middleware\*.js src\realtime.js) do node --check "%f"
```

Frontend production build from `client`:

```bat
npm run build
```

If installation hangs, check internet/proxy/firewall, Node/npm versions (`node -v`, `npm -v`), then retry `npm install`. Do not deploy until the build succeeds.

## 8. Prepare mobile app shell

The project includes Capacitor configuration. After the web build works:

```bat
cd client
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

Install Android Studio and the Android SDK first. For iOS builds, a Mac with Xcode is required. Native background GPS needs additional Android/iOS permissions, lifecycle handling, battery testing and app-store policy review; the browser implementation is foreground-only.

## 9. Before public launch

- Use HTTPS and exact production origins in `CLIENT_URL`.
- Use production secrets, secure database network rules, backups, least-privilege DB users, and log redaction.
- Test payment webhooks against the provider's current signature specification, including duplicate and delayed events.
- Replace public OpenStreetMap/Nominatim and OSRM endpoints with a production-supported mapping/routing provider, and add dispatch timeout/reassignment, cancellation policy, route-based fare reconciliation and traffic-aware ETA.
- Add a secure TURN provider for reliable WebRTC calls.
- Add explicit driver online/offline controls, location retention limits, consent and privacy policy.
- Add professional identity verification, audit logs for document views/decisions, incident response procedures, and abuse/rate-limit testing. Activity records capture important state changes, not every single action or every GPS ping.
- SOS records notify CivicRide admins only; the app does not automatically call emergency services.
