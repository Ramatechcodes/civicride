CivicRide reviewed fixes

Changed:
- client/src/App.jsx: wallet history is cleared and prior requests are invalidated on session changes; responses are accepted only for the owning session and latest request (including refresh requests).
- client/src/App.jsx: merged the rating and cancellation dialogs and passenger PNG branding from the alternate source into the mounted App component. client/src/main.jsx remains pointed at ./App.jsx. Existing email OTP and wallet presentation were preserved.

Verified against current uploaded source:
- client/src/passenger-theme.css already excludes .dark-mini from the white-panel background rule and already defines dark-mini white text. No change needed.
- client/src/main.jsx already imports ./App.jsx. No change needed.

Not included in uploaded archive:
- PHASE-UI-REFERENCE-UPDATE.md
- server/AUTH-OTP-SETUP.md
Those review comments could not be applied because neither file was present in the uploaded client-only ZIP.

Validation:
- JSX transpilation/syntax check passed with zero diagnostics using the installed TypeScript transpiler.
- Full Vite production build not run in this environment. Run npm run build in client before committing.
