# Dexa Workplace frontend

React 19 / TypeScript 5 / Vite 6 employee attendance and HRD portals. All frontend code and configuration live in this directory.

## Development

Install dependencies using the repository's workspace package manager once the root workspace is ready. From the root, run `npm run dev --workspace @dexa/web`, or run `npm run dev` from `apps/web` after dependencies are available.

- Frontend: `http://localhost:5173`
- Vite proxies `/api` to `http://localhost:3000`, preserving the `/api` prefix.
- No API keys, public upload directory, mock data, or frontend environment variables are required.
- `npm run build`: `tsc --noEmit && vite build`
- `npm test`: Vitest tests for geolocation, Jakarta dates, and paginated own-attendance lookup, using the Node environment and stubbed browser APIs.

The frontend declares all of its own dependencies. For isolated validation, dependencies can be installed from this directory with `npm install --workspaces=false --package-lock=false --ignore-scripts --no-audit --no-fund`. This implementation used that frontend-local installation only; it did not install dependencies or change files at the repository root.

## Routes

| Role | Routes |
| --- | --- |
| Public | `/login` |
| Employee | `/employee/dashboard`, `/employee/attendance`, `/employee/history`, `/employee/profile` |
| HRD | `/hrd/dashboard`, `/hrd/employees`, `/hrd/employees/create`, `/hrd/employees/:id/edit`, `/hrd/attendances`, `/hrd/attendances/:id` |

`/`, `/employee`, and `/hrd` redirect to the appropriate home. Cross-role navigation redirects to the signed-in user's dashboard. Unknown routes show a not-found page.

## API and security behavior

- Axios uses `/api`, `Authorization: Bearer <token>`, and the `{ data: payload }` envelope. Employee and attendance lists use `{ items, total, page, pageSize }` payloads.
- Login accepts email and password. The access token is held in `sessionStorage`, not persistent local storage. Restored sessions must pass `GET /auth/me` before protected content renders. Validation network errors have an explicit retry screen. HTTP 401 clears the token, user, and query cache.
- Employee creation sends only the specified six employee fields; the backend assigns role `EMPLOYEE`. There is no role selector. Password is required for creation and omitted from PATCH when left blank. Edit supports `ACTIVE` / `INACTIVE`. No attendance update or delete controls exist.
- Check-in sends multipart `photo`, `latitude`, `longitude`, and `gpsAccuracy` if available. It never sends an employee ID or client-generated attendance timestamp. Submit is not automatically retried.
- Photos are fetched with the authenticated API client from `/files/:id` as blobs, displayed through short-lived object URLs, and revoked on cleanup. No raw public upload URLs are used.
- No background location polling. `getCurrentPosition` is called only inside an explicitly submitted, validated check-in form. Permission denial, unavailable location, timeout, unsupported browsers, invalid coordinates, and insecure contexts are handled separately. A fresh high-accuracy location is requested with a 15-second timeout.
- Photos must be JPEG/PNG, nonempty, and at most 5 MiB. Backend validation and role enforcement remain mandatory.
- Dates and times display in `Asia/Jakarta`. Dashboard check-in state searches later pages of own attendance if today is not on the first page, without depending on a server sort order. The backend remains authoritative for daily uniqueness and timestamps.
- Opening the optional Google Maps link is a user action and shares those recorded coordinates with Google; no third-party map is embedded or loaded automatically.

## Deployment / integration

Serve `dist` as a static SPA with unknown non-API paths falling back to `index.html`. The production reverse proxy must forward `/api` to the gateway; the Vite proxy is development-only. Use HTTPS outside localhost so browser geolocation works (a LAN IP over HTTP will not work). If embedding, ensure your Permissions-Policy allows geolocation for this origin.

No demo credentials are embedded. Use an account provisioned by the backend seed/HR team. End-to-end behavior requires the gateway and services to be running and seeded. This app does not add checkout, approvals, live tracking, HRD attendance edits, or password recovery endpoints that are outside the supplied contract.
