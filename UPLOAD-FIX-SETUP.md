# CivicRide — document upload and ngrok setup (Windows)

This version changes the document upload flow and the local development networking so the browser does not call `http://localhost:5000` directly from the ngrok HTTPS website.

## What changed

- The Vite frontend defaults to `/api` instead of hardcoding `http://localhost:5000/api`.
- Vite proxies `/api` and `/socket.io` to the local Express API at `127.0.0.1:5000`.
- Driver documents can be saved privately on the local server during development without requiring Cloudinary credentials.
- PDF, JPG and PNG files are accepted up to 8 MB; upload errors are returned with clearer messages.
- File signatures are checked, and locally stored documents are only served through an authenticated admin endpoint.
- The admin UI can open locally stored files using the admin bearer token.

## Before you start

1. Extract this ZIP into a new folder, for example `C:\Users\Owner\Desktop\CivicRide-Advanced-Upload-Fix`.
2. Do not copy your old `.env` files into public chats or upload them anywhere.
3. Make a new `client/.env` from `client/.env.example` and a new `server/.env` from `server/.env.example`.
4. Fill in your MongoDB connection string, a new random JWT secret (at least 32 characters), and your real Google Web application Client ID in both environment files where requested.
5. Because earlier messages contained credentials, rotate exposed MongoDB, Brevo, Cloudinary and JWT secrets before using this project.

## Install and run

Open two Command Prompt windows.

### Terminal A — backend

```bat
cd C:\Users\Owner\Desktop\CivicRide-Advanced-Upload-Fix\server
npm install
npm run dev
```

Wait until you see `MongoDB connected` and `CivicRide API listening on 5000`.

### Terminal B — frontend

```bat
cd C:\Users\Owner\Desktop\CivicRide-Advanced-Upload-Fix\client
npm install
npm run dev
```

Open `http://localhost:5173` first to check the app locally. The backend health endpoint is `http://localhost:5000/api/health`.

## Use the existing ngrok frontend URL

Keep the existing ngrok tunnel that forwards to port 5173 running. Its URL in the current setup is:

`https://rewire-fountain-stinging.ngrok-free.dev`

You do **not** need a second ngrok tunnel for port 5000 for this development setup. The browser sends `/api` and `/socket.io` requests to the frontend origin, and Vite forwards them to the backend on the same computer.

If the frontend ngrok domain changes, update `allowedHosts` in `client/vite.config.js`, the `CLIENT_URL` in `server/.env`, and the Authorized JavaScript origins in Google Cloud Console.

## Google OAuth setup

In Google Cloud Console → Google Auth Platform → Clients, open your Web application client and add this under **Authorized JavaScript origins**:

- `https://rewire-fountain-stinging.ngrok-free.dev`
- `http://localhost:5173`
- `http://127.0.0.1:5173`

Do not add `/api` to these origins. Use the same Web application Client ID in `client/.env` and `server/.env`. For the Google credential flow in this project, add redirect URIs only if the code you deploy uses an OAuth redirect callback.

## Document upload behaviour

`DOCUMENT_STORAGE=local` stores driver verification files in `server/private_uploads`. The directory is not exposed as a public static folder. An authenticated admin must request the file through the API. This is suitable for local development and testing on the same computer.

For a production deployment, use persistent private storage. Configure valid Cloudinary credentials in `server/.env` and set `DOCUMENT_STORAGE=cloudinary`. Do not use local disk storage on an ephemeral hosting service, because files may disappear when the instance restarts or redeploys. Test with non-sensitive sample files before uploading real identity documents.

Accepted file types: PDF, JPG, PNG. Maximum file size: 8 MB. If upload fails, read the notice displayed by the app and the backend terminal output.

## Common problems

- **`ERR_NGROK_334`:** The existing ngrok domain is already online. Reuse the current tunnel; do not start the same domain again.
- **Google `origin_mismatch`:** The URL in the browser must exactly match an Authorized JavaScript origin.
- **Upload says sign in required:** Sign in as a driver. Only driver accounts can submit documents.
- **Upload returns 413:** Reduce the file size to below 8 MB.
- **Upload returns unsupported file type:** Use a real PDF, JPG or PNG file, not a renamed Word document.
- **Admin cannot see the file:** Confirm the driver upload succeeded, then refresh the admin dashboard and open the document using the admin account.
- **MongoDB startup failure:** Check `MONGODB_URI` and the database user's current password and network access list.

## Security notes

- Keep `.env` files private; they are excluded by `.gitignore`.
- `server/private_uploads` is also excluded from Git.
- Rotate any credentials that have been shared or exposed.
- Before production, use HTTPS, persistent private document storage, backups, a privacy policy, and a retention/deletion policy for identity documents.
