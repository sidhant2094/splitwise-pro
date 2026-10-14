# Splitwise Pro — Client

React + Vite + TypeScript PWA. See the root [README](../README.md) for the full project setup.

## Local development (with the API)

```bash
npm run dev               # Vite dev server on http://localhost:5173
```

It calls `VITE_API_BASE_URL` from `client/.env` (see `.env.example`). If that variable is unset in development, it falls back to `http://localhost:4000/api`. Start the API with `npm run dev:server` from the repo root.

## Demo mode (no backend)

```bash
npm run dev:demo          # Vite dev server with in-memory sample data
```

Demo mode runs the whole UI on deterministic fixtures in `src/demo/`. It needs no server, database, credentials or network access.

- A yellow **DEMO DATA** banner is always visible. Demo data is never a live account.
- Changes live in memory and reset on reload.
- Destructive and settlement actions use the fixed demo admin password `demo`.
- Demo mode is enabled only by `VITE_DEMO_MODE=true`, which `.env.demo` sets for `dev:demo`. The demo router loads in its own chunk and is never fetched in a normal build.

## How the API URL is resolved

| Build            | `VITE_API_BASE_URL` | Result                                                       |
| ---------------- | ------------------- | ------------------------------------------------------------ |
| `npm run dev`    | set                 | that URL                                                     |
| `npm run dev`    | unset               | `http://localhost:4000/api` (development only)               |
| production build | set                 | that URL                                                     |
| production build | unset or empty      | no request is made; the app shows a **Setup needed** message |

There is no production fallback to localhost, and no URL is hardcoded.

## Production deployment (Render)

`render.yaml` already defines the static site (`splitwise-pro-client`, publish path `client/dist`, a rewrite of `/*` to `/index.html` for client-side routes) and the API web service (`splitwise-pro-server`). The client needs two settings that the repository cannot know:

1. **On `splitwise-pro-client` (Render static site):** `VITE_API_BASE_URL` = `https://<server-service>.onrender.com/api`. It must include `/api`, and the URL must be the server's public address. A rebuild is needed after any change.
2. **On `splitwise-pro-server` (Render web service):** `CLIENT_ORIGIN` = `https://<client-site>.onrender.com`, the exact origin of the static site, with no trailing slash. Without it, CORS allows any origin rather than only the frontend.

Free Render web services sleep when idle. The first request can take up to about a minute. The client shows a "waking up" hint after a few seconds, keeps requests open for up to 60 seconds, and offers **Try again** instead of spinning forever. A change that timed out may still have been saved, so the UI says so rather than reporting a failure.

## Architecture notes

- **API layer:** `src/api/` holds one module per resource. Each function uses the existing routes and response envelope (`{ success, data }` or `{ success: false, error }`). Admin actions send `X-Admin-Password` in a header only.
- **Failure handling:** `NetworkError` (unreachable, offline, timeout) and `ApiRequestError` (business or validation error) are distinct. Network failures are not retried automatically. Server errors (5xx) get one automatic retry. Every screen renders a non-blocking error inside the app shell with a retry action.
- **Insights assistant:** `src/insights/` is rule-based. It answers a fixed set of questions from the group's expenses, people, categories, balances, suggested settlements and settlement history, all read from existing endpoints. **No AI model is connected**, and the UI says so. Free-form questions that fall outside those rules are declined.

## Tests and checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Tests mock HTTP responses. They prove frontend behaviour, not the deployed integration.
