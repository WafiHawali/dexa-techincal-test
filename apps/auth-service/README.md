# Auth TCP service

Owns `users` only. Employee data is obtained exclusively over Employee RPC.

## Configuration and running

Run from the repository root with `npm run build --workspace @dexa/auth-service`,
`npm run dev --workspace @dexa/auth-service`, or `npm start --workspace @dexa/auth-service`.
The build emits `dist/apps/auth-service/src/main.js` inside this workspace.
Dependencies are inherited from the root; Prisma Client must already be generated.

`JWT_SECRET` is required at startup and must contain at least 32 characters excluding
surrounding whitespace. Use a cryptographically random secret. `JWT_EXPIRES_IN`
defaults to `8h`; accepts positive integer seconds or durations with `s`, `m`, `h`,
`d`, or `w` units. Tokens use HS256, issuer `dexa-wfh`, audience `dexa-web`, and
require an expiration. Verification reloads the account role and active employee.
`DATABASE_URL`, `AUTH_PORT` (default 4001), `EMPLOYEE_HOST`, and `EMPLOYEE_PORT`
use the shared module's configuration. `dotenv/config` loads from the process
working directory; with npm workspaces, inject environment variables or point
`DOTENV_CONFIG_PATH` at the root environment file. The environment example was
not readable under the editor's private-file policy, so its expiry value could
not be independently checked.

## Contracts

- `auth.login({email,password})` -> `{accessToken,user}`.
- `auth.verify({token})` -> `user`.
- `user` is exactly `{id,employeeId,role,employee}`; `employee` is the complete
  Employee record, with dates serialized by TCP transport. No password hashes
  leave this service. Invalid credentials and inactive accounts share a 401.
- `auth.createUser({employeeId,password})` -> `{id}`; bcrypt cost 12, always
  `EMPLOYEE`, never accepts a role. Requires an existing employee over RPC.
- `auth.deleteUser({employeeId})` -> `{success:true}`; idempotent internal
  employee-creation compensation only, not a public account deletion endpoint.
- `auth.updatePassword({employeeId,password})` -> `{id}`; internal HRD employee
  workflow only. Passwords must have 8+ characters and at most 72 UTF-8 bytes.
- `health` -> `{service:'auth-service',status:'ok'}` after `SELECT 1`.

The TCP listener is a trusted private-network boundary, not a public API.
Internal account-management patterns have no end-user authorization mechanism;
restrict reachability to trusted services and never expose these patterns through
an arbitrary gateway proxy. Gateway-authenticated actor payloads are likewise
trusted only on that private network. Put authentication/rate limiting on the
public login route. Password changes do not revoke already-issued JWTs; account
removal or employee deactivation does prevent subsequent verification.
