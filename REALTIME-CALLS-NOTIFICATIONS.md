# CivicRide real-time calling, chat and lock-screen notifications

## Call fix in this release

- The caller now applies the answer's nested `signal.sdp` instead of passing the whole signaling envelope to `setRemoteDescription`.
- ICE candidates received before the peer connection/remote description is ready are queued and applied after SDP negotiation.
- Call actions now report a disconnected signaling socket instead of silently attempting to emit.
- Incoming-call browser notifications are attempted when browser notification permission is already granted and the web app is running.

## Required production settings

1. Deploy the client and API over HTTPS.
2. Set the API `CLIENT_URL` to the exact production client origin, without a trailing slash unless the code expects it.
3. Confirm Render WebSocket support is enabled by using the same API origin for Socket.IO; check the browser Network tab for a successful `/socket.io/` connection.
4. Configure a TURN server (for example, a managed TURN provider) and add its `urls`, `username`, and `credential` to the `RTCPeerConnection` `iceServers` array. STUN alone is not reliable on all carrier/mobile networks.
5. Ensure both participants are members of the same ride and have selected that ride in Call & chat. Messages are persisted by the API and broadcast to the ride's Socket.IO room.

## Lock-screen notification limitation

The browser `Notification` API is not a guaranteed push-notification service. It cannot reliably deliver incoming calls or messages when the browser is closed, the page is suspended, or the phone OS has stopped the web app. Production background notifications require a service worker, Push API subscription storage, a server-side push sender (VAPID/Web Push or Firebase Cloud Messaging), and user permission. Native Android/iOS call-screen behavior additionally requires native push/call integration. These credentials and provider setup cannot be safely invented or enabled automatically by this source patch.

To enable it, configure VAPID keys or Firebase credentials in Render, implement subscription registration/removal and authenticated push endpoints, and test on actual Android/iOS devices. An incoming-call push should alert the user to open the app and answer; it cannot by itself establish a WebRTC call while the app is closed.


## Web Push implementation included in this patch

This patch adds a visible notification panel for signed-in users, a service worker, authenticated subscription storage, VAPID push sending, a test-push endpoint, chat-message push, and selected ride-status push notifications.

Render backend variables required: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (for example `mailto:you@example.com`). After deploying, sign in on each device, tap Enable notifications, then Send test. Use HTTPS. iPhone requires iOS/iPadOS 16.4+ and the Home Screen web app installed from Safari. Web Push does not guarantee native full-screen incoming calls while the app is closed; answering calls with the app fully closed requires native calling integration.
