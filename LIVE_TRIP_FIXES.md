# CivicRide live trip fixes

## Changes included
- Fixed the missing `distanceBetween` helper that caused a React `ReferenceError` and could blank the passenger rides view after a driver accepted/started a trip.
- Added a live trip progress bar that uses the latest driver GPS location to estimate progress and remaining distance while the trip is in progress.
- Added a 12-second passenger ride refresh as a fallback if Socket.IO is interrupted. Existing Socket.IO events and call/video-call code were not replaced.
- Added server-side web-push milestone updates at 25%, 50%, 75%, and 90% trip progress. Notifications reuse one tag so newer milestone messages replace the prior one rather than spamming on every GPS update.
- Added a ride field to prevent duplicate progress milestone notifications.

## Deploy steps
1. Keep a copy of your current project and environment variables.
2. Merge these files into your project (or replace the matching files).
3. Restore your existing `client/.env` and `server/.env` values from your secure local copy or deployment environment. The `.env.example` files intentionally contain placeholders, not secrets.
4. Install dependencies and run the client build; deploy both client and server changes together.
5. For lock-screen/browser push updates, the passenger must enable notifications in CivicRide and allow notifications in device/browser settings. The driver app/browser must remain online and share GPS during the trip.

## Important platform limitation
The progress bar is live inside the CivicRide dashboard. Web push notifications show a compact text progress bar (for example `█████░░░░░ 50%`) at milestones; standard browser notifications do not support a native animated lock-screen progress bar. A true iOS Live Activity or Android ongoing notification progress bar requires a native mobile implementation. Distance remaining is a straight-line GPS estimate, not turn-by-turn road distance.
