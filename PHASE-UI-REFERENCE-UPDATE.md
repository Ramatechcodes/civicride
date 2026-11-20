# CivicRide Passenger UI — Reference-led update

This update uses the supplied multi-screen ride-hailing wireframe as a UX reference while retaining CivicRide's existing green/off-white brand palette and existing application/API behavior.

## Included changes
- Replaced the small raster header/footer logo with a clean, scalable SVG wordmark (`public/civicride-logo.svg`).
- Added a dedicated Passenger Wallet screen with balance, quick top-up amounts, checkout handoff, and transaction history using the existing `/payments/wallet/*` API contracts.
- Added a Wallet destination to the Passenger bottom navigation; retained Activities, Safety, Profile and the role-specific Driver/Admin destinations.
- Refined the Safety Centre contrast with a deep green background, white text, accessible warning panel and high-contrast SOS action.
- Kept the existing booking/map and live-ride workflows and preserved Driver/Admin source components.

## Install
1. Back up the current `client/src` and `client/public` folders.
2. Merge the contents of this `client` folder into the existing client folder, replacing files when prompted.
3. Keep your local `.env` files; they are not included in this package.
4. From the client folder run `npm ci` (or `npm install` if you intentionally do not use the lockfile), then `npm run build`.
5. Test with passenger, driver and admin accounts before pushing.

## Important integration notes
- Wallet top-up still calls the existing backend endpoint and redirects to the returned `paymentUrl`. It does not simulate payment success.
- Transaction history still depends on the backend response from `/payments/wallet/history`.
- SOS behavior remains whatever the existing backend implements; the UI does not claim that SOS contacts emergency services.
- The supplied reference contains payment methods such as Apple Pay and Google Pay, but this update does not add unsupported payment methods. Only the existing Cash and Flutterwave options are retained until backend support is confirmed.
