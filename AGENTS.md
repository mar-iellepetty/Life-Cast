# LifeCast repository guidance

This is a React/Vite frontend with a same-origin Node backend. Read README.md for setup and service configuration.

- Keep the landing page at `/`, the integrated TypeScript planning workspace at `/studio`, and the preserved JavaScript studio at `/classic-studio`.
- `src/api/lifecastApi.js` connects to the local backend. `base44Client.js` is a compatibility facade; this app does not require a hosted Base44 backend.
- Keep AWS credentials and licensed calculator credentials server-side. Never commit `.env` files or place secrets in frontend/VITE variables.
- Current assessment and report figures come from CalcXML. Keep the separate timeline projections explicitly identified as illustrative.
- Preserve shared chat state and the existing avatar voice lifecycle rather than creating competing playback engines.
- `npm run server` starts the API; `npm run dev` starts Vite. `npm start` builds and serves the combined local app.
- Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` for relevant changes.
- Optional Whisper binaries and models are ignored; retain their setup instructions and license notices.
