# File TCP service

Nest TCP only, shared `bootstrap`, default port 4004 (`FILE_PORT` override). Owns only `attendance_photos` plus filesystem bytes. Requires `DATABASE_URL`, Attendance TCP (`ATTENDANCE_HOST`/`ATTENDANCE_PORT`), and a writable `UPLOAD_DIR` (default `uploads` relative to process cwd). Use a persistent volume and an absolute `UPLOAD_DIR` in deployment; do not serve it as static content. No HTTP/Multer endpoint is provided: gateway owns memory uploads, this service owns storage.

Commands with root dependencies installed:

- `npm run build --workspace @dexa/file-service`
- `npm test --workspace @dexa/file-service`
- `npm start --workspace @dexa/file-service`

## Exact RPC contracts

`photo` = `{originalname:string,mimetype:string,buffer:BASE64_STRING,size:number}`. `actor` = trusted gateway-derived `{id:number,employeeId:number,role:'HRD'|'EMPLOYEE'}`. IDs must be positive signed-32-bit integers. Rejects unknown input fields.

- `file.validate({photo})` -> `{valid:true,mimeType:'image/jpeg'|'image/png',fileSize:number}`. No writes or DB queries. Exported `validatePhoto()` utility returns decoded bytes/MIME/normalized extension locally; bytes never appear in RPC validation output.
- `file.store({attendanceId:number,photo})` -> `PhotoMetadata`. Internal orchestration only. Revalidates photo, checks `attendance.internalGet({id:attendanceId})`, then writes bytes and metadata.
- `file.list({attendanceIds:number[]})` -> `PhotoMetadata[]`, ascending metadata ID. Empty IDs return `[]`; max batch 10,000. Internal only, intentionally does not enforce actor roles.
- `file.read({actor,id:number})` -> `{base64:string,mimeType:string,fileName:string}`. Metadata ID, not attendance ID. Obtains attendance via `attendance.internalGet` and requires HRD or matching EMPLOYEE owner before reading bytes; 403 cross-owner, 404 missing metadata/file/attendance.
- `file.removeForAttendance({attendanceId:number})` -> `{removed:number}`. Internal, retryable compensation: unlink file (ENOENT tolerated), then remove its metadata. Keeps metadata if unlink fails, allowing retry. Does not remove attendance rows.
- `health({})` -> `{service:'file-service',status:'ok'}` after `SELECT 1`.

`PhotoMetadata` = `{id:number,attendanceId:number,fileName:string,mimeType:string,fileSize:number,createdAt:ISO_DATE_STRING}`. Never returns `filePath`. Original filenames are not stored or used as filesystem paths.

## Validation and storage guarantees

- Required nonempty canonical base64 with exact declared byte size, maximum 5 MiB (5 * 1024 * 1024 bytes). Encoded-length bound is checked before decode. Oversize -> 413; malformed/mismatch -> 400.
- Only matching `image/jpeg` + `.jpg`/`.jpeg` or `image/png` + `.png` (case-insensitive extension). Filename length 1–255.
- JPEG requires SOI/marker prefix and final EOI bytes. PNG requires signature, IHDR length/type, positive dimensions and final IEND chunk. This is signature validation, **not full image decoding**, CRC verification, re-encoding, or malware scanning. Sharp is not required/installed.
- Random UUID filename plus normalized extension; exclusive `wx` creation and mode 0600. Never overwrites an existing filename. Path reconstruction only accepts generated names inside configured upload directory; stored database `filePath` is never trusted for reads/removal or exposed externally.
- Partial writes/close failures and metadata-create failures attempt metadata cleanup by random filename and unlink of only the file this call exclusively created. Successful cleanup -> 507 storage error, permitting Attendance Service compensation. Inconclusive database cleanup -> 503, keep file and log attendance ID/filename for reconciliation. Database writes themselves may have committed before an error acknowledgment.
- Internal TCP endpoints must be network-isolated; actor data is not independently authenticated. Gateway must expose read only, never internal store/list/remove methods directly.

## Distributed failure caveat

Filesystem + MySQL + TCP are not a single transaction. Process crashes can leave orphan files or missing metadata. A lost `file.store` reply can leave a finalized photo: Attendance Service preserves it and its attendance on 500/503/504 instead of deleting after an ambiguous timeout. Cleanup must not run concurrently with a potentially still-running store. Operators must reconcile logged IDs and UUID filenames after operations have quiesced; see Attendance Service README. No background repair, idempotent upload protocol or cross-service foreign-key cascade is claimed.

## Focused validation coverage

`src/file.test.ts` covers valid PNG/JPEG signature recognition; MIME/extension/size/base64/signature rejection; 5 MiB regex safety; real temporary filesystem storage/read/removal; metadata-write-failure cleanup; ownership enforcement and metadata path redaction. Database/RPC are mocked. Real MySQL/TCP and crash recovery require integration validation.

Validation attempted during implementation: the build command above failed because `tsc` was not available; the test command failed because `tsx` was not available. Root dependency installation is managed separately and was not modified here. Editor diagnostics likewise report unavailable Nest/Prisma/Node types. Tests/build are **not claimed passing**; rerun after root installation and Prisma client generation.
