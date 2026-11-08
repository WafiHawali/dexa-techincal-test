# Attendance TCP service

Uses shared `bootstrap`, Prisma and TCP clients. Default port 4003; `ATTENDANCE_PORT` overrides it. Requires `DATABASE_URL`, Employee TCP (`EMPLOYEE_HOST`/`EMPLOYEE_PORT`) and File TCP (`FILE_HOST`/`FILE_PORT`). Run from a configured working directory with the root dependencies installed:

- `npm run build --workspace @dexa/attendance-service`
- `npm test --workspace @dexa/attendance-service`
- `npm start --workspace @dexa/attendance-service`

Owns only `attendances`; employee and photo data are fetched over TCP, never via cross-owner Prisma queries. No public update/delete patterns.

## Exact RPC contracts

Actors are trusted gateway-derived `{id:number,employeeId:number,role:'EMPLOYEE'|'HRD'}`. Positive signed-32-bit integer IDs are required. TCP ports must remain private; there is no end-user authentication on internal TCP calls.

Photo wire input: `{originalname:string,mimetype:string,buffer:string,size:number}`, where `buffer` is canonical base64, not a serialized Node Buffer. Gateway handles Multer memory upload and base64 conversion; File Service owns disk storage.

- `attendance.checkIn({actor,data:{latitude:number,longitude:number,gpsAccuracy?:number},photo})` — EMPLOYEE only, active employee required. Returns enriched attendance described below.
- `attendance.list({actor,query?:{page?:number|string,pageSize?:number|string,search?:string,date?:string}})` — HRD only. Returns `{items:EnrichedAttendance[],total:number,page:number,pageSize:number}`.
- `attendance.mine({actor,query?:{page?,pageSize?,search?,date?}})` — EMPLOYEE only, same response, always constrained to actor's employee ID.
- `attendance.detail({actor,id:number})` — HRD or owning EMPLOYEE. Returns enriched attendance; 404 when absent, 403 on another employee's record.
- `attendance.internalGet({id:number})` — internal only. Returns raw attendance or 404. Used by File Service authorization; no employee/photo dependency.
- `health({})` — executes `SELECT 1`, returns `{service:'attendance-service',status:'ok'}`.

`EnrichedAttendance` = all Prisma Attendance scalar fields (`id,employeeId,attendanceDate,checkInAt,status,latitude,longitude,gpsAccuracy,createdAt`) plus `employee:Employee|null` and `photos:PhotoMetadata[]`. Dates and Prisma Decimals serialize using Prisma/Nest JSON behavior (ISO date strings and decimal strings respectively). Employee includes the Employee Service's public record fields, never auth credentials. Photo metadata is `{id,attendanceId,fileName,mimeType,fileSize,createdAt}` with no filesystem path. Check-in/detail/list enrichment uses `employee.internalList({ids})` and `file.list({attendanceIds})`.

Search resolves `employee.internalList({search})` first, then filters attendance by matching employee IDs. Mine intersects search with the caller's employee ID. Page defaults to 1, pageSize to 20, maximum pageSize 100, offset capped to signed-32-bit. Search max 191 characters. Date requires exact real `YYYY-MM-DD`, years 1000–9999 (no timestamps or date normalization). Results sort descending by check-in timestamp then ID, with consistent count/page queries in a repeatable-read transaction.

## Validation and consistency

Unknown fields are rejected, including request timestamps/employee IDs. Coordinates must be finite numeric latitude [-90,90], longitude [-180,180], optional accuracy >=0 (no arbitrary upper cap). Timestamps are server-generated UTC; attendance day uses shared `jakartaDate()` (Asia/Jakarta) encoded as UTC midnight for MySQL DATE. Error payloads follow shared `{statusCode,message}` handling: 400 validation, 403 authorization/inactive, 404 absent, 409 duplicate, 413 oversized photo, and upstream 5xx failures.

Check-in order:

1. Validate actor; check today's duplicate **before** file validation or storage.
2. Validate GPS; fetch employee and require ACTIVE; call `file.validate({photo})`.
3. Create attendance with server time; unique `(employeeId,attendanceDate)` prevents races. A losing race returns 409 without `file.store`.
4. Call `file.store({attendanceId,photo})`, which revalidates and checks attendance existence.
5. Enrich the finalized record. An enrichment failure never rolls back the saved photo/attendance.

Confirmed store failures (including File Service's 507 after successful local cleanup) trigger `file.removeForAttendance`, then attendance deletion. If cleanup fails, retain attendance and log its ID for reconciliation. Ambiguous 500/503/504 store outcomes retain attendance and any finalized photo: a lost reply/timeout does not prove the remote write failed. Never issue compensation that could race a late successful store.

### Distributed crash limitation

This is compensating orchestration, not a distributed transaction. A crash after attendance creation can leave an attendance without a photo; a timeout can mean a completed or incomplete check-in. Such rows keep the unique day reservation; retry can return 409. An enrichment failure can also return an error despite a finalized check-in. Operators must reconcile the logged attendance ID against `attendance.internalGet` and `file.list`, verify no store is still in flight, then complete or clean up through the owning services. Files may also be orphaned if File Service crashes between writing bytes and metadata. Production hardening needs a durable workflow/state machine, idempotency keys, reconciliation worker and temporary-file lifecycle; none is implied by this schema.

## Focused validation coverage

`src/attendance.test.ts` tests GPS/date/pagination validators, Jakarta day boundary, duplicate-before-upload, inactive/invalid-photo rejection, unique race, success ordering/enrichment, search/mine filtering, confirmed rollback, failed compensation, ambiguous timeout preservation and role restrictions. No running database is required for these mock-backed tests. Real MySQL/TCP/crash-injection integration remains separate.

Validation attempted during implementation: the build command above failed because `tsc` was not available; the test command failed because `tsx` was not available. Root dependency installation is managed separately and was not modified here. Editor diagnostics likewise report unavailable Nest/Prisma/Node types. Tests/build are **not claimed passing**; rerun after root installation and Prisma client generation.
