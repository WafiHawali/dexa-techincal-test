# Implementation and verification report

This report records the implemented scope and reported verification evidence. The six implementation phases below organize the work by deliverable; they are not six calendar days or a claim that every item in the [five-day blueprint](../dexa-wfh-technical-implementation-blueprint.md) has been manually accepted.

## Six-phase report

| Phase | Implementation completed | Verification and boundaries |
| --- | --- | --- |
| 1 — Initialization and architecture | npm workspaces, React/Vite, HTTP gateway plus four NestJS TCP services, shared RPC/Prisma infrastructure, MySQL schema/migration and owner boundaries | All-workspace build passed twice and again in final verification; fresh MySQL initial migration and environment-driven seed passed; repeated migration/seed was idempotent |
| 2 — Backend and security | bcrypt/JWT, refreshed role/activity verification, employee management/account provisioning, immutable attendance APIs, bounded multipart/private photos, daily uniqueness and compensating sagas | 12 Attendance and 4 File tests passed; live local integration passed 36 groups including File outage/restoration; full and production npm audits each reported zero vulnerabilities |
| 3 — One-time GPS | Explicit check-in-only `getCurrentPosition`, finite coordinate/accuracy validation, server timestamp and Jakarta day, permission/unavailable/timeout guidance | Automated utility/API checks and Chrome known-coordinate override passed; error callbacks injected for denied/unavailable/timeout. No real hardware GPS or remote HTTPS verification |
| 4 — Frontend portals | Employee dashboard/profile/check-in/history; HRD dashboard/employee editor/monitoring/detail; sessions, protected routes, authenticated photo blobs, responsive tables and error states | 18 frontend tests and 13 Chrome browser groups passed; Employee/HRD 375px layout checks passed after `.data-table` containment of absolute screen-reader labels. This is browser viewport testing, not physical mobile-device certification |
| 5 — Testing and developer workflow | Root unit/integration/browser scripts, database preparation, safe env generator, source-dev smoke runner and metadata-preserving backend watch mode | `npm test`: 34 passed total. Source `npm run dev` API flow through Vite passed 35 groups using the dev-smoke command below. Integration scripts apply migrations/seed and create records; they do not reset/delete the database |
| 6 — Deployment and final documentation | Consolidated multi-target Dockerfile, Nginx SPA/API proxy, Compose migration/health dependencies and volumes, optional seed job, README and testing/operations guide | Backend, tooling and web images built; Compose healthy startup and explicit seed exited 0 with host MySQL port 3307. Deployed Nginx passed 35 API groups and 13 Chrome 157 browser groups. Four Docker outage/persistence checks passed. Manual acceptance remains separate from automated evidence |

## Verification evidence

Results below are the reported integration results; counts refer to the named suite, not individual assertions within a group.

| Check | Command or environment | Result |
| --- | --- | --- |
| Workspace compilation | `npm run build` | Passed twice across all workspaces and repeated successfully in final verification |
| Unit/regression | `npm test` | 34 passed: Attendance 12, File 4, frontend 18; repeated pass |
| Dependency audit | `npm audit` and `npm audit --omit=dev` | Zero reported vulnerabilities in both scans; final root audit repeated successfully |
| Live local integration | Local compiled gateway/services against MySQL; root `npm run test:integration` entry point | 36 groups passed, including File outage and restored health |
| Development-mode integration | `INTEGRATION_MYSQL_PORT=3307 npm exec --offline --call="node scripts/dev-smoke.mjs"` | 35 API groups passed through Vite with all source backend services |
| Browser | Chrome; known geolocation override and injected failure callbacks | 13 groups passed; 375px Employee/HRD layout checks passed |
| Database bootstrap | Fresh MySQL initial migration and environment-supplied seed, repeated | Passed, including idempotent repetition |
| Docker images | Dockerfile `runtime`, `build` tooling, and `web` targets | All built successfully |
| Compose readiness | `MYSQL_PORT=3307 docker compose up -d --no-build --wait` | Exit 0; gateway HTTP healthcheck covers all TCP/database services |
| Explicit Docker seed | `MYSQL_PORT=3307 docker compose --profile seed run --rm --no-deps seed` | Exit 0 against the migrated/healthy stack |
| External Docker API | `INTEGRATION_BASE_URL=http://localhost:8080/api node scripts/integration.mjs` | 35 groups passed through deployed Nginx |
| External Docker browser | `BROWSER_BASE_URL=http://localhost:8080 npm run test:browser` | 13 groups passed in Chrome 157 |
| Docker resilience | `RUN_DISPOSABLE_OUTAGE_TESTS=true MYSQL_PORT=3307 node scripts/docker-resilience.mjs` | Four checks passed: File outage, photo bytes retained after full File container replacement, actual MySQL outage, restored queries/data/photos and service reconnection |

Port 3307 was used because local port 3306 belongs to another project; it was left untouched. Source CLI and Docker validation are complete with the reported stack healthy. Local compiled integration can use gateway port 3100 and TCP ports 4101–4104 to coexist with Docker rather than stopping it; those alternate-port reruns are not counted as additional passes without separate evidence. Test records are retained; no reset/delete is performed. Inline environment assignments above use POSIX-shell syntax. The current engine range is `^22.12.0 || ^24.0.0 || >=26.0.0`; Node 23.x/25.x are not included. Audit results describe the dependency snapshot scanned, not a guarantee of production security.

## Decisions and blueprint adaptations

1. **Four services plus one HTTP gateway.** Frontend talks only to the gateway; Nest TCP is a simple internal transport, not a public API or durable queue.
2. **Logical ownership in shared MySQL.** Employee owns `employees`, Auth owns `users`, Attendance owns `attendances`, File owns `attendance_photos`. Shared schema/credentials simplify the technical test. Scalar IDs and owner RPCs replace cross-owner foreign keys/joins. Isolation is conventional, not database-enforced; seed is a bootstrap-only cross-owner exception.
3. **Gateway multipart, File validation/storage.** Nest's Multer interceptor is HTTP-specific, not a TCP multipart parser. Gateway uses bounded memory (one file, 5 MiB, three fields/four parts), checks MIME/extension early, then forwards base64 through Attendance to File. File owns authoritative size/type/signature validation, metadata, generated paths, disk and cleanup. This is buffered transport, not streaming; concurrent requests still require edge limits.
4. **Unique attendance insert before permanent photo storage.** Photo preflight validation precedes insertion; the unique employee/Jakarta-day constraint resolves races before loser requests can store photos. This intentionally adapts the blueprint's conceptual photo-first sequence.
5. **Compensating saga, not atomicity.** Confirmed failures attempt file cleanup before attendance removal. Ambiguous storage 500/503/504 outcomes preserve attendance to avoid deleting a late successful store. Cleanup failures log reconciliation IDs; enrichment errors do not undo committed check-in. No durable saga/outbox/reconciliation worker exists, and an error response may be followed by 409 on retry. Passing branch/outage tests does not remove crash-window limitations.
6. **Server time and one-time GPS.** Server time determines UTC timestamps and Jakarta-day uniqueness. Only explicit validated check-in attempts request location; browser coordinates are spoofable, not location attestation or background tracking. HTTPS/localhost is required. Browser override evidence is not real hardware GPS evidence.
7. **Read-only HRD attendance.** HRD manages employee master data and passwords, but cannot edit/delete attendance. No public attendance mutation beyond Employee check-in, standalone photo-upload, or recovery endpoint is provided. Internal cleanup is saga recovery, not an HRD editing capability.
8. **No built-in passwords.** `npm run setup:env` uses dependency-free Node crypto and exclusive `wx` creation to generate private `.env` without overwriting existing configuration. Only example seed emails are printed; random passwords remain in `.env`. Seed requires all four `SEED_*` values, minimum 12-character/maximum 72-UTF-8-byte passwords, and resets the designated accounts on repetition.
9. **Metadata-preserving source development.** Backend dev scripts use `node --watch --require ts-node/register/transpile-only src/main.ts` to retain Nest decorator metadata. An esbuild/`tsx` source runner is not an equivalent replacement for this backend path. The supervisor loads root environment, generates Prisma and starts workspaces, but does not start/migrate/seed MySQL.
10. **Consolidated deployment.** One Dockerfile has `dependencies`, `build`, `production-dependencies`, `runtime` and `web` targets. Only Nginx config remains under `infrastructure/`. Compose HTTP health calls `/api/health` and verifies four TCP/database dependencies. Host `MYSQL_PORT` is configurable; internal MySQL stays 3306. Nginx uses `proxy_hide_header` for upstream `X-Content-Type-Options` and `Referrer-Policy`, then emits each once at the edge.
11. **Explicit production limitations.** Bearer tokens in session storage, process-local login limiting (429), trusted-network TCP without service authentication/TLS, shared DB permissions and signature-only image validation remain tradeoffs. No refresh tokens, server logout/password-reset revocation, malware scanning, retention/audit pipeline, or production HA/backup implementation is claimed.

## Verification boundaries

- **Completed:** source CLI/dev flows, deployed Nginx API/browser suites, explicit Docker seed, healthy Compose startup, and opt-in Docker outage/reconnection/persistence checks. No external-deployment validation remains pending.
- **Not verified:** real hardware GPS, physical mobile-device behavior and remote trusted HTTPS/TLS deployment.
- **Manual acceptance:** unchecked scenarios in [TESTING.md](TESTING.md) remain a reproducible checklist, not assertions of completion.
- **Operational limitations:** File container replacement and MySQL restart persistence were verified; backup restoration, production ingress/security hardening and durable saga reconciliation are not established by these results.
- **Safe resilience scope:** the outage script requires explicit `RUN_DISPOSABLE_OUTAGE_TESTS=true` and is only for this project's disposable local Compose stack. It performs reversible stop/start and File recreation without database/volume erasure. Dependency outages legitimately produce 503 or TCP timeout 504.
- **Editor diagnostics:** generated Prisma types can remain cached in an editor even when all CLI TypeScript builds pass. Regenerate with `npm run prisma:generate` and restart the TypeScript language server if needed.

Update this report only with observed evidence, retaining the distinction between local compiled services, source-development mode, browser overrides and the external Docker deployment.
