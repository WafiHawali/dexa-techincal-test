# Foundation contracts

## Backend workspaces

The parent owns `apps/**`. Backend package names are `@dexa/api-gateway`,
`@dexa/auth-service`, `@dexa/employee-service`, `@dexa/attendance-service`, and
`@dexa/file-service`. Each uses `tsc -p tsconfig.json` for `build`, extends
`../../tsconfig.base.json`, and sets `rootDir: "../.."`, `outDir: "dist"`.
For example, Auth's entrypoint compiles to
`apps/auth-service/dist/apps/auth-service/src/main.js`.

Import shared code from `../../../packages/shared/src`, not `@dexa/shared`:
the relative imports remain valid in each service's compiled output.
`@dexa/shared` performs a no-emit typecheck during workspace builds.

Each `main.ts` must load `import 'dotenv/config'` first. TCP services call
`bootstrap('auth-service', 4001, AppModule)` (or the equivalent name/port).
Import `PrismaModule` and `RpcModule` once in each service root that needs them.
`PrismaService` awaits its database connection during startup; do not catch and
ignore connection failures. Handle bootstrap rejection with a nonzero exit.
The HTTP gateway owns its HTTP bootstrap, health endpoint, and exception filter.

## RPC

`RpcModule` globally registers injection tokens `AUTH`, `EMPLOYEE`, `ATTENDANCE`,
and `FILE`. Client factories `rpcClientOptions(name)` and `createRpcClient(name)`
are also exported. Standalone factory clients must be closed by their caller.
Client addresses use `AUTH_HOST`/`AUTH_PORT` etc., defaulting to localhost and
4001/4002/4003/4004. Servers bind `0.0.0.0`, not the destination `*_HOST`.

`rpc<T>(client, pattern, payload)` uses `firstValueFrom` and an 8000ms timeout.
It throws `RpcException({ statusCode, message })`, never `HttpException`.
`fail(statusCode, message)` throws the same shape. The gateway's HTTP filter
must unwrap `RpcException.getError()` or use `rpcError(error)` and set the HTTP
status. TCP bootstrap installs validation (transform, whitelist,
forbidNonWhitelisted) and `RpcErrorFilter` globally. Validation DTOs must be
classes with validation decorators, not erased interfaces.

Errors: unique conflict 409; missing update/delete target 404; invalid data 400;
database/transport unavailable 503; timeout 504; unexpected error 500. Internal
details are not returned to clients. `Actor` has numeric `id`, `employeeId`, and
role `EMPLOYEE | HRD`. `MAX_PHOTO_BYTES` is 5 MiB.

## Persistence and check-in coordination

Employee owns `employees`, Auth owns `users`, Attendance owns `attendances`,
and File owns `attendance_photos`. There are no Prisma relation fields, foreign
keys, cascades, or ORM includes across owners. Resolve and authorize references
through RPC. `User.employeeId` is unique; attendance has a unique
`[employeeId, attendanceDate]`; photos require `attendanceId` with an index and
have no duplicate `employeeId` column. There is no pending attendance state.

`jakartaDate(now)` returns UTC midnight representing the Asia/Jakarta calendar
day for the MySQL DATE column. `checkInAt` is the actual server UTC timestamp.
Use the same captured `now` for both values. Database uniqueness is the final
concurrency guard, not an earlier duplicate check alone.

The parent implements the check-in saga: validate/stage the photo first, create
attendance, commit File metadata using its attendance ID, and compensate both
attendance and staged/stored file on failure. Timeout does not prove that the
remote write failed: use idempotent operation IDs/reconciliation before cleanup
or retry. Without persisted saga state, this foundation alone cannot guarantee
recovery after a process crash or hide an in-flight attendance row; do not claim
otherwise. No cross-owner database transaction should be added in request code.

## Setup and deployment

The parent runs root `npm install`; the foundation does not run it. Copy
`.env.example` to `.env` and supply database credentials and a strong JWT secret.
Use URL-safe database passwords or URL-encode credentials in DATABASE_URL.
For Compose, the interpolated MySQL user/password must already be URL-safe.
`npm run db:migrate` applies the checked-in migration; `npm run db:seed` is
explicit and requires all four `SEED_*` values. Seed passwords must have at least
12 characters and at most 72 UTF-8 bytes (bcrypt's input limit). Re-running seed
reconciles accounts by fixed seed employee numbers and resets their credentials
to the configured values. This seed is the sole documented bootstrap exception
to table ownership: it provisions Employee and Auth records directly.

`npm run dev` generates Prisma then supervises the six workspace `dev` scripts.
It stops all subprocesses when one fails or on interruption. Each backend must
provide its own dev script; migrations and seeding are intentionally not run by
the supervisor. Start MySQL and migrate before running the services.

`docker compose up --build` starts MySQL 8.4, waits for its authenticated health
query, runs migrations once, and starts the services. The Docker build stage
builds all workspaces. Runtime commands use each service's nested compiled path.
`docker compose --profile seed run --rm seed` provisions accounts explicitly.
The tooling image retains Prisma CLI/tsx; backend runtime prunes dev dependencies.
No seed credentials are compiled into either image.

Only gateway 3000 and nginx 8080 are publicly published; MySQL 3306 is bound to
loopback for local development. TCP service ports are not published. The upload
volume is mounted only into File. The gateway readiness check is TCP-level, not
an application or dependency health guarantee. Each service still fails fast if
its initial database connection cannot be established.

The separate web Dockerfile compiles Vite with `VITE_API_BASE_URL=/api` and serves
SPA routes through nginx, forwarding `/api/` unchanged to `api-gateway:3000`.
The backend owns protected photo streaming; nginx does not expose uploads.
