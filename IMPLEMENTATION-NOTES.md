# CivicRide mobile ride upgrade notes

## Implemented in this package

1. **Passenger map booking** — use GPS, search pickup/destination, click the map to place a destination pin, view available nearby drivers, and view a road route when OSRM responds.
2. **Nearby driver dispatch** — approved drivers explicitly go online, report fresh foreground GPS, receive requests by Socket.IO, and only see requests in their vehicle category and nearby radius.
3. **Trip tracking** — assigned passenger and driver join authenticated ride rooms; driver location is streamed to the passenger and passenger GPS is shared to the assigned driver only during an active trip. Trip-share links refresh while active and show the vehicle plate.
4. **Driver profile** — vehicle make/model/color/plate/category and private document review remain in the existing onboarding flow.
5. **Wallet and coins** — passengers can initialize a Flutterwave wallet top-up; the backend verifies the transaction before crediting the balance and records wallet history. Completed rides award loyalty coins.
6. **Admin monitoring** — dashboard now receives activity feed events, online-driver counts, driver map locations, rides, accounts, document review and SOS incidents. Activity summaries deliberately do not include chat text or every GPS ping.
7. **Mobile navigation** — bottom tabs include Home, My rides, Wallet, Safety and Call & chat; map and booking panels are responsive.

## First launch checklist

- Copy `server/.env.example` to `server/.env`; set MongoDB URI, random 48-byte JWT secret, frontend origin, Brevo and private Cloudinary storage credentials.
- Copy `client/.env.example` to `client/.env`; set the API URL for your chosen deployment. Never put secret keys in `VITE_*` variables.
- Run `npm install` in both `server` and `client`, then start the API and Vite development server in separate terminals.
- Use two browser profiles/devices to test passenger and driver roles, and a separate admin account. Approve every required driver document before approving the driver.
- Use Flutterwave sandbox keys and webhook configuration first. A top-up is credited only after provider verification.
- Use HTTPS for production GPS, microphone and camera permissions.

## Production boundaries

- Public OpenStreetMap Nominatim and OSRM endpoints are used for development map search and route estimates. Replace them with a supported provider for production scale, SLA, attribution and key management.
- Browser geolocation is foreground-only. Native background location requires Android/iOS permissions, lifecycle handling, battery testing and privacy disclosures.
- Fare is an estimate, not a guaranteed quote or traffic-aware metered fare. No payout/withdrawal settlement or coin redemption is implemented.
- WebRTC calling can require a TURN service to work across mobile carrier networks and restrictive NATs.
- Admin activity is a practical operational log, not a tamper-proof compliance audit system.
- SOS creates an admin incident; it does not automatically call emergency services.
