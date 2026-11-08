# Testing and acceptance guide

## Recorded results

- All-workspace `npm run build` passed twice and passed again in final verification.
- `npm test`: **34 passed** (Attendance 12, File 4, frontend 18), repeated successfully.
- Full `npm audit` and production `npm audit --omit=dev`: **zero reported vulnerabilities** in each scan; final root audit also passed again with zero vulnerabilities.
- Live local compiled-service/MySQL integration: **36 groups passed**, including File outage and restoration.
- Full source-development API flow through Vite: **35 groups passed**.
- Real Chrome browser execution: **13 groups passed**, including Employee/HRD layouts at 375px. The layout fix contains absolute screen-reader-only labels within positioned `.data-table` containers.
- Fresh MySQL initial migration and environment-driven seed passed; repeated migration/seed was idempotent.
- Backend, tooling and web Docker images built; `MYSQL_PORT=3307 docker compose up -d --no-build --wait` exited 0.
- Explicit Docker seed (`MYSQL_PORT=3307 docker compose --profile seed run --rm --no-deps seed`) exited 0 after migration/healthy startup.
- External deployed Nginx: **35 API groups passed**, and **13 browser groups passed in Chrome 157**.
- Opt-in Docker resilience: **four checks passed**, verifying File outage, exact photo bytes after File container force-recreation, actual MySQL outage, and recovered queries/data/photos after restart with service reconnection. Source CLI and Docker stack verification are complete and healthy.

GPS success used the actual Chromium geolocation API in a real browser with a known-coordinate override, not actual physical coordinates; denied/unavailable/timeout used injected callbacks. These are real rendered-browser tests with simulated location inputs, **not real hardware GPS, physical-device or remote HTTPS validation**. The manual checklists below intentionally remain unchecked and do not negate the separately recorded automated results. See [IMPLEMENTATION.md](IMPLEMENTATION.md) for the six-phase report and evidence boundaries.

## Automated commands and prerequisites

Run at the repository root with Node matching `^22.12.0 || ^24.0.0 || >=26.0.0` (not Node 23.x/25.x). Before installing dependencies, run `npm run setup:env` to create a private `.env` with random secrets; existing files are left unchanged. Install dependencies using `npm ci`:

```sh
npm run prisma:generate
npm run build
npm test
npm audit
npm audit --omit=dev
```

Root `npm test` runs workspace test scripts and propagates failures. Suites cover attendance coordinates/dates/pagination, Jakarta boundaries, duplicates/races, saga compensation/timeouts, file validation/lifecycle/authorization, and frontend date/query/geolocation utilities. They use mocks and temporary files where appropriate; the 34 passing tests do not replace live-stack or real hardware GPS verification. Audit results describe the scanned dependency snapshot, not a general security certification.

### Docker/MySQL integration

The root entry point is:

```sh
npm run test:integration
```

This runs `scripts/prepare-db.mjs` followed by `scripts/integration.mjs`. Preparation loads root `.env` (inherited environment takes precedence), applies `db:migrate`, and runs `db:seed`: it **resets designated seed credentials**. The suite creates uniquely named test employees/attendance/photos and **does not delete these records**. It does not drop/reset the database. Build first; local mode launches compiled backends and requires their ports to be free. Requirements:

- Running Docker Engine/Desktop, Docker Compose v2, and ability to pull/build the Node/MySQL images.
- An **isolated, disposable MySQL database/Compose project**, not a shared development or production database. The reference Compose database is MySQL 8.4.
- Database connectivity and application configuration matching the test runner's execution context. Host processes use a published localhost port; containers use the MySQL service DNS name, not their own localhost.
- Caller-supplied `DATABASE_URL` and, when using repository Compose, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, plus matching `MYSQL_USER`/`MYSQL_DATABASE` names if overridden.
- Required `JWT_SECRET` (at least 32 characters after trimming); all four `SEED_HRD_EMAIL`, `SEED_HRD_PASSWORD`, `SEED_EMPLOYEE_EMAIL`, `SEED_EMPLOYEE_PASSWORD` if the harness seeds accounts. Use distinct valid emails and passwords of at least 12 characters and at most 72 UTF-8 bytes. There are no default account credentials.
- `MYSQL_PORT` controls Compose's published host port (default 3306); `DATABASE_URL` must match for normal host-run commands. Setup generates a URL on 3306. If using 3307, edit both settings privately or use the test-only override below. `INTEGRATION_MYSQL_PORT` overrides only the database URL port for preparation/test processes; it does not republish Docker's port.
- Never target valuable data: migration deployment, seed password resets and accumulated test records are observable changes even without database deletion.

Apply migrations/seed through the harness; do not race its lifecycle operations. The verified local run passed 36 real HTTP gateway → TCP service → MySQL groups, including authentication/roles, employee provisioning, multipart/photo access, duplicates and File outage/restoration. Local mode owns its backend processes and can inject the File outage. External mode (`INTEGRATION_BASE_URL`, including `/api`) owns no servers and deliberately skips outage injection.

The verified environment used port 3307 because 3306 is occupied by another project; leave that project untouched. Examples below use POSIX-shell inline assignments; use equivalent process environment settings on other shells:

```sh
MYSQL_PORT=3307 docker compose up -d mysql
INTEGRATION_MYSQL_PORT=3307 npm run test:integration
```

For the setup-generated default port, start MySQL on 3306 and run `npm run test:integration` without the override. For ordinary local development, a Compose port change still requires matching `DATABASE_URL`; the test override is not an application-wide setting.

To run compiled integration alongside the healthy Docker stack without stopping it, select free host service ports, for example:

```sh
PORT=3100 AUTH_PORT=4101 EMPLOYEE_PORT=4102 ATTENDANCE_PORT=4103 FILE_PORT=4104 INTEGRATION_MYSQL_PORT=3307 npm run test:integration
```

This is a coexistence command, not an additional recorded test result. It still applies migration/seed and retains test records. The source-dev smoke runner below assumes gateway 3000 and Vite 5173; do not run it concurrently with a Docker gateway occupying 3000.

If only the editor reports stale Prisma types despite passing CLI builds, run `npm run prisma:generate` and restart its TypeScript language server before treating cached diagnostics as a schema problem.

### Source-development smoke test

After database preparation, with ports 3000, 5173 and 4001–4004 free:

```sh
INTEGRATION_MYSQL_PORT=3307 npm exec --offline --call="node scripts/dev-smoke.mjs"
```

This passed 35 API groups through Vite and exercises all source backend services, readiness and process cleanup. It runs through npm because the supervisor needs `npm_execpath`. Source backend dev mode uses `node --watch --require ts-node/register/transpile-only` to preserve Nest decorator metadata; esbuild/`tsx` is not an equivalent backend dev runner. The supervisor loads root `.env` but does not start MySQL or apply migrations/seed. The smoke runner manages servers, so do not run a second `npm run dev` alongside it.

### Chrome/Chromium browser suite

With compiled backends and a migrated/seeded disposable database:

```sh
INTEGRATION_MYSQL_PORT=3307 npm run test:browser
```

Local mode starts compiled backends and Vite. The browser runner currently defaults its MySQL override to **3307**; explicitly use `INTEGRATION_MYSQL_PORT=3306` for a default-port database. It creates test accounts and records rather than cleaning them up.

The runner uses installed Windows Chrome at its known path when available, otherwise `BROWSER_EXECUTABLE` or Playwright Chromium. If no suitable browser is installed:

```sh
npx playwright install chromium
```

Alternatively set `BROWSER_EXECUTABLE` to the full executable path (installed Windows Chrome takes precedence in the current runner). `BROWSER_BASE_URL` selects an existing frontend origin, without `/api`, and disables managed server startup. The 13 verified Chrome groups include known-coordinate GPS success, callback-injected denied/unavailable/timeout handling, private photo rendering, portal flows and 375px viewport checks. They do not establish real GPS hardware or remote TLS behavior.

### External Docker acceptance (verified)

After the built Compose stack is migrated and healthy, explicitly seed without restarting its dependencies, then target its published interfaces:

```sh
MYSQL_PORT=3307 docker compose --profile seed run --rm --no-deps seed
INTEGRATION_BASE_URL=http://localhost:8080/api node scripts/integration.mjs
BROWSER_BASE_URL=http://localhost:8080 npm run test:browser
```

Use `node scripts/integration.mjs` for an already prepared external stack to avoid implicitly rerunning root database preparation. Ensure seed environment credentials match that stack and use a disposable deployment: external tests still create records. The seed exited 0; the external API suite passed 35 groups and the browser suite passed 13 groups in Chrome 157 through deployed Nginx. External suites do not manage/stop containers. Nginx suppresses upstream `X-Content-Type-Options` and `Referrer-Policy` with `proxy_hide_header` and emits each once at the edge, avoiding duplicate values.

### Docker outage and persistence checks (verified)

Run **only against this project's disposable local Compose stack**, from the repository root, after integration has created a photo-backed attendance:

```sh
RUN_DISPOSABLE_OUTAGE_TESTS=true MYSQL_PORT=3307 node scripts/docker-resilience.mjs
```

The explicit flag is mandatory; it is an acknowledgement, not automatic proof that your selected Compose project is safe. Confirm the local project/environment before running. The runner defaults to `http://localhost:8080/api` (overridable with `INTEGRATION_BASE_URL`) and runs Compose operations against the local project. Do not point the API URL at an unrelated remote stack.

All four checks passed:

1. Stop File; health/photo reads return sanitized **503 or 504**. TCP timeout is a legitimate outage response, not a requirement to return 503 immediately. Restart File.
2. Force-recreate the complete File container with its named upload volume retained; the private image bytes match the original exactly.
3. Stop actual MySQL; health and authenticated identity requests return sanitized **503 or 504**. Restart MySQL.
4. Confirm services reconnect, the attendance can be queried, and database/photo data—including exact image bytes—survive the restart.

This uses reversible stop/start and File container replacement; it does not reset/delete the database or erase volumes. Test data remains. Do not run concurrent tests during intentional outages, stop the unrelated service on 3306, or replace the process with destructive `down -v`. These checks establish restart/container-replacement persistence, not backup restoration or distributed-saga crash recovery.

## Manual test preparation

1. Follow the [README setup](../README.md#local-development-with-npm) or Docker instructions. Check `/api/health` reports all four service/database replies; Compose's gateway HTTP healthcheck now uses this same endpoint.
2. Log in using the credentials **you supplied** through seed environment values. Use HRD to create at least two disposable Employee accounts to test ownership and fresh daily check-ins. Do not repeatedly seed a shared database: it resets bootstrap credentials.
3. Prepare a genuine small JPG and PNG, an empty file, a renamed non-image, mismatched extension/MIME fixtures, and a disposable file just over 5 MiB. Do not use malicious executable content or sensitive employee photos.
4. Use browser developer tools to inspect requests/statuses and record expected versus observed outcomes. Do not publish bearer tokens, passwords, raw personal coordinates, or full database URLs in screenshots/logs.
5. Use a fresh account per successful check-in scenario rather than deleting attendance to bypass daily uniqueness. Do not change a shared machine/database clock for date testing.

## Authentication, session and role matrix

- [ ] HRD and Employee sign in with their supplied credentials and land on the appropriate portal; wrong credentials return a generic failure.
- [ ] A private API without a token or with a malformed/expired token returns 401; session expiry clears the browser token/cache and returns to login.
- [ ] Reload restores identity via `/api/auth/me`; a temporary server outage shows a retry/error state rather than granting access from stale identity alone.
- [ ] Employee cannot call employee management or HRD attendance list/detail APIs (403); changing frontend routes does not bypass server guards.
- [ ] HRD cannot call Employee-only check-in/history APIs (403).
- [ ] Employee A can download A's photo but not B's; HRD can view either. Use actual **photo IDs** from metadata.
- [ ] HRD deactivates a disposable Employee; that account can no longer log in or use its existing token. Do not deactivate the only HRD account.
- [ ] Logout clears session and user-scoped cached data; a subsequent different user's login does not display the previous user's records.

Login throttling is a bounded process-local guard that returns **429** when its limit is exceeded. Avoid brute-force/load tests against shared environments.

## Employee and HRD flows

- [ ] HRD creates an employee with a supplied password; that employee can log in. Duplicate email/employee number is rejected without a usable partial account.
- [ ] Search, page changes, empty results and form/server errors behave correctly. Confirm pagination totals rather than treating the first page as the entire dataset.
- [ ] HRD edits name/department/position and resets a disposable password; confirm the old/new password behavior. Existing-token revocation after password reset is not implemented.
- [ ] Employee sees their own profile, dashboard and history, not another employee's records.
- [ ] HRD dashboard and attendance monitoring reflect the created check-in; search/date filters and detail show employee, photo, coordinates, optional accuracy and Jakarta time.
- [ ] No attendance edit/delete controls exist. Direct PUT/PATCH/DELETE requests to attendance paths find **no mutation route** (normally 404 after routing; record actual response). GET requests must not mutate attendance. Employee master-data edits do not constitute permission to rewrite attendance.
- [ ] Refresh/deep-link navigation works in both Vite and the Docker Nginx SPA, including loading/error/empty states.

## Browser GPS, HTTPS and check-in

Test in at least one desktop browser and, for remote/mobile access, a trusted HTTPS origin:

| Scenario | Expected behavior |
| --- | --- |
| Open dashboard/check-in page without submitting | No location request, polling, watcher, or background tracking |
| Missing/invalid photo or unchecked confirmation | Validation blocks submission before GPS/upload |
| Valid photo + confirmation, press submit | One fresh `getCurrentPosition` call for this attempt, high accuracy requested, 15-second timeout, zero maximum age |
| Permission allowed | One multipart request containing photo, latitude, longitude and accuracy if available; success shows server-recorded attendance |
| Permission denied | Clear permission-settings guidance; no check-in request/attendance write |
| Location unavailable | Clear device/location-services guidance; no check-in request |
| Location timeout | Clear retry guidance; no check-in request |
| Unsupported geolocation API | Clear browser-support error |
| Non-secure remote/LAN HTTP origin | Secure-context error; no request pretending to contain valid GPS |
| Localhost HTTP | Secure-context geolocation permitted by supported browsers; user permission still required |
| Trusted HTTPS remote/mobile | Permission and GPS can work; verify certificate trust and no mixed-content API requests |
| Retry after denied/unavailable location | New explicit attempt only; permission may already be granted so a second dialog is not guaranteed |

Permission can be reset in browser site settings. Browser developer-tools location overrides can simulate a coordinate or unavailable position; clearly label simulated evidence, and repeat the happy path on an actual device for GPS acceptance. Timeout/unsupported API cases may need a temporary browser automation stub in an isolated test, not application source changes. Browser behavior varies; do not claim a real permission-dialog test from a mocked unit test.

On successful check-in, verify the photo can be fetched privately, latitude/longitude persist, and accuracy is either present or correctly omitted. Confirm only one attendance exists for the Jakarta day. A second submission, rapid double click, or two tabs must not create a second row/photo set; the API duplicate path returns 409. The UI's disabled/in-flight state is convenience, not the concurrency guarantee.

Use deterministic clock-injected/unit cases for the **17:00 UTC = midnight Jakarta** boundary; changing browser time must not determine server check-in time. Never change a shared server's clock to test uniqueness.

## API validation and file boundary cases

Use Swagger or an authenticated API client against a disposable account. Let the client generate the multipart boundary.

- [ ] Missing photo/GPS, unknown fields (`employeeId`, `checkInAt`, `attendanceDate`, `status`), nonnumeric/NaN/infinite/out-of-range coordinates and negative accuracy are rejected.
- [ ] Missing optional accuracy is accepted; zero latitude/longitude and zero accuracy are valid values.
- [ ] Empty/unsupported/mismatched-extension-or-MIME/signature-invalid photos are rejected before permanent attendance creation.
- [ ] Files larger than 5 MiB are rejected (gateway 413); proxy-level oversized bodies may produce Nginx's own non-envelope 413 response. Multiple files/excess multipart parts/fields are rejected.
- [ ] Proper JPG/JPEG/PNG up to the limit can pass validation; signature acceptance is not proof of a fully decodable/safe image. Use real images for rendering acceptance.
- [ ] Invalid IDs, excessive page size and impossible calendar dates are rejected; absent rows/files return 404 without filesystem paths/SQL/secrets.
- [ ] Protected photos return image bytes and `Cache-Control: private, no-store`; a guessed static uploads URL cannot bypass authorization.

## Safe failure injection and reconciliation

**Only use a disposable stack, synthetic records and dedicated volumes.** Obtain operator approval for a shared environment. Save row IDs and baseline file/metadata counts; preserve logs without secrets. Do not fill a host disk, alter a production upload directory's permissions, kill shared MySQL, delete random rows/files, or use `docker compose down -v` on valuable data. Prefer mocked fault injection for precise crash/timeout timing.

For a dedicated Compose stack only, a reversible service outage can be tested with:

```sh
docker compose stop file-service
```

Submit once from a fresh Employee, observe the failure, then restore promptly:

```sh
docker compose start file-service
```

Stopping File **before** preflight should fail without attendance creation. It does not prove mid-store compensation. Restarted services may need time to reconnect; verify `/api/health` before another attempt. Likewise, temporarily stopping a single other service can test sanitized availability errors in an isolated stack, but document the exact stage and observed code rather than assuming every outage yields the same status.

| Fault / stage | Expected invariant to inspect |
| --- | --- |
| File validation rejects before insert | No new attendance, metadata or bytes |
| Concurrent attendance insert race | Unique index admits one row; loser never calls permanent file store |
| Confirmed File failure after row creation, with local cleanup complete | File reports 507; Attendance asks File cleanup first, then deletes attendance if compensation succeeds |
| File write/metadata cleanup itself fails | Uncertain 503 and reconciliation log; do not infer no bytes/metadata remain |
| Storage 500/503/504 or lost reply | Attendance preserved; no blind cleanup racing a late store; refresh history before retry |
| Compensation fails | Attendance retained; log identifies reconciliation ID |
| Store succeeds, response enrichment fails | Attendance/photo remain committed; a subsequent check-in may return 409 |
| Process crash between filesystem and database operations | Partial state possible; no durable recovery worker is promised |

Use existing Attendance/File unit fixtures for controlled 507, 504 and cleanup failures. For live mid-request fault injection, use a test harness/proxy or isolated temporary storage fixture capable of deterministic staging; do not patch production code or try to time destructive database shutdowns. A mocked timeout validates branch logic, not all real network races.

### Operator inspection after an ambiguous outcome

1. Restore dependencies and allow in-flight operations to settle. Do not retry storage/removal concurrently with an uncertain old request.
2. Record the attendance ID from logs/history. Read-only inspection should compare the attendance owner record, File metadata for that attendance, and corresponding UUID-named bytes in the dedicated storage volume. Inspect through authorized tools; do not expose database/upload volumes publicly.
3. Determine whether the result is complete, an attendance lacking a photo, metadata lacking bytes, or orphan bytes. A failed HTTP response alone cannot make this determination.
4. Escalate recovery to an operator with an approved backup/audit procedure. No public HRD attendance write endpoint or automatic repair command exists. Do not give HRD ad-hoc SQL delete instructions or remove attendance merely to unblock a retry.
5. Retest only in the disposable environment or with a fresh employee. Report the outcome and limitations, including any residual reconciliation work.

## Persistence and deployment acceptance

- [ ] Fresh Docker build/start applies checked-in migrations after MySQL health, then starts backends/web.
- [ ] Seed is explicit and refuses missing credentials; ordinary `up` does not silently seed a default account.
- [ ] Restarting containers without deleting volumes retains employees, attendance and readable photos.
- [ ] Local `npm run dev` inherits the intended root `.env`; no Docker DNS hostname leaks into host-run TCP/database destinations. Supervisor exits all workspace children on stop/failure.
- [ ] TCP service ports stay private; remote deployment has HTTPS, appropriate origins, upload/rate limits and protected secrets.
- [ ] Database and photo backup/restore are reviewed together. Routine `docker compose down` preserves volumes; destructive teardown is reserved for a confirmed disposable test project.

Keep newly observed manual results separate from the recorded automated evidence above. External Docker API/browser and resilience checks passed; real hardware GPS and remote trusted HTTPS remain unverified. Do not infer completion of an unchecked scenario from an adjacent automated test.
