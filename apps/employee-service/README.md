# Employee TCP service

Owns `employees` only. User creation/password changes use Auth RPC; this service
never reads or writes the users table.

## Configuration and running

From the root: `npm run build --workspace @dexa/employee-service`,
`npm run dev --workspace @dexa/employee-service`, or
`npm start --workspace @dexa/employee-service`.
Build output is `dist/apps/employee-service/src/main.js` inside this workspace.
Dependencies are inherited from the root; Prisma Client must already be generated.
Set `DATABASE_URL`; the TCP port is `EMPLOYEE_PORT` (default 4002), and outbound
Auth RPC uses `AUTH_HOST` / `AUTH_PORT`. `dotenv/config` loads from the process
working directory; inject variables or set `DOTENV_CONFIG_PATH` to the root
configuration file when using npm workspace commands.

## Contracts

All Employee records contain only Prisma Employee scalar fields: `id`,
`employeeNumber`, `fullName`, `email`, `department`, `position`, `status`,
`createdAt`, `updatedAt`. Dates are serialized by TCP transport.

Internal patterns, for trusted services only:

- `employee.findByEmail({email})` -> Employee or `null`; trims/lowercases emails.
- `employee.internalGet({id})` -> Employee, or 404. Includes inactive records;
  callers responsible for authorization must check status. Used for profiles.
- `employee.internalList({ids?,search?})` -> Employee[]. Search matches name or
  employee number; ID and search filters intersect. Empty IDs returns `[]`.
  Includes inactive records. IDs have a maximum batch size of 10,000.

Every public operation requires a valid `{id,employeeId,role:'HRD'}` actor:

- `employee.list({actor,query:{search?,page?,pageSize?}})` ->
  `{items,total,page,pageSize}`; defaults 1/20, page size 1..100, stable ID ordering.
- `employee.get({actor,id})` -> Employee or 404.
- `employee.create({actor,data:{employeeNumber,fullName,email,department?,position?,password}})`
  -> Employee after account creation. Status defaults to `ACTIVE`.
- `employee.update({actor,id,data})` -> Employee. Supports the employee fields
  above, optional `status:'ACTIVE'|'INACTIVE'`, and optional `password` forwarded
  to `auth.updatePassword`. At least one field is required. Nullable department
  and position can be cleared with `null`.
- `employee.delete({actor,id})` -> Employee with `status:'INACTIVE'`; never removes
  historical employees or accounts. Existing JWTs fail their next auth check.
- `health` -> `{service:'employee-service',status:'ok'}` after `SELECT 1`.

Nested inputs are validated independently of the gateway. Unknown fields are
rejected; identifiers must be positive MySQL integers. Passwords are 8+ characters
and at most 72 UTF-8 bytes. Emails are stored trimmed/lowercased, and database
uniqueness constraints handle races (mapped to 409 by the shared filter).

## Cross-service consistency

Creation persists the employee, then calls `auth.createUser`. On failure it first
deactivates the employee, calls idempotent `auth.deleteUser`, then removes the new
employee. If compensation fails, it logs only the employee ID for reconciliation;
after successful deactivation, the retained employee cannot log in. The original
failure is returned, not a false success.

This is a compensating saga, NOT a distributed transaction. A timeout/connection
loss is ambiguous: Auth may have committed, or an in-flight create may finish
AFTER compensation. That can leave an orphan account requiring reconciliation.
A timeout can also reach the gateway while this service is still compensating;
do not automatically retry creation without checking the employee number/email.
If the database itself fails during deactivation, even the fail-closed update
cannot be guaranteed. Production hardening would require durable saga state,
idempotency keys, and reconciliation; do not treat network failure as proof that
the remote write did not happen.

Updates persist employee fields before forwarding an optional password change.
A password RPC failure does not roll back already-saved profile/status changes;
report the failure and retry only the password update after checking state. This
avoids overwriting concurrent employee edits with an unsafe snapshot rollback.

Actor authorization assumes the caller is the trusted gateway. TCP services and
internal lookup/account-management patterns must remain on a private network,
not exposed through a generic public pattern proxy.
