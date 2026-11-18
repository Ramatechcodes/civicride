# CivicRide server — email OTP setup

## What the current code supports

- Registration OTP is sent by email through Brevo.
- OTPs are six digits, stored as SHA-256 hashes, expire after 10 minutes, and allow up to five verification attempts.
- SMS OTP is not implemented. The `/api/auth/otp/sms` endpoint intentionally returns an error until a real SMS provider adapter is written.
- The server needs MongoDB and a JWT secret before it starts listening.

## Configure email delivery

1. Create/sign in to a Brevo account.
2. Verify the sender email address or authenticate the sending domain in Brevo.
3. Create a Brevo API key.
4. In `server/.env`, set:
   - `BREVO_API_KEY` to the API key
   - `BREVO_SENDER_EMAIL` to the verified sender address
   - `BREVO_SENDER_NAME=CivicRide` (optional)
5. Keep `.env` private. Never commit it or paste API keys into chat.
6. Restart the server after changing environment variables.

## Start and check the server

From the `server` directory:

```bash
npm install
npm run dev
```

The server should log `MongoDB connected` and `CivicRide API listening on 5000`.

In a browser, open:

```text
http://localhost:5000/api/health
```

Expected response:

```json
{"ok":true,"service":"CivicRide API"}
```

A healthy endpoint only proves the API process is responding. It does not prove Brevo email delivery.

## Test email OTP

Send a POST request to `http://localhost:5000/api/auth/otp/request` with JSON:

```json
{"email":"you@example.com","purpose":"register"}
```

Expected success response:

```json
{"message":"Verification code sent if the email is deliverable. Check inbox and spam."}
```

Then check the inbox and spam folder. If the request returns HTTP 503, check that the Brevo variables are present in the server's actual `.env`. If it returns HTTP 502, the Brevo API rejected or failed the send; check the server terminal and Brevo logs.

Do not expose the OTP or API key in screenshots or shared logs.

## Frontend configuration

The browser client must point to the API origin, not the Vite dev server. For local development, configure the client's API URL to `http://localhost:5000` (or the exact base URL expected by the client API helper), then restart Vite.

The server allows `http://localhost:5173` by default in development. If Vite is running on a different port, add that exact origin to `CLIENT_URL` in `server/.env`, then restart the server.

## Important

The provided server archive does not include the actual `.env`, so its real MongoDB connection, JWT secret, Brevo credentials, and production deployment status cannot be verified from this archive alone.
