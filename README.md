# Attendance System

Employee attendance application for WFH teams. Employees check in and clock out with photo evidence. HRD manages employee records and monitors attendance in read-only mode.

## Stack

- React 19, Vite, TypeScript, Tailwind CSS
- NestJS API gateway and four TCP microservices
- Prisma and MySQL 8.4
- Docker Compose for deployment

## Features

- Employee login with email or employee number
- Photo check-in with camera or file upload
- Photo clock-out
- Personal attendance history
- HRD employee management and password reset
- Read-only HRD attendance monitor with photo evidence

One attendance record is allowed per employee per Asia/Jakarta day. Attendance time is set by the server. No GPS or location data is collected.

## Quick start

Requirements: Node 22.12+ or 24+, npm, and MySQL 8.4.

```sh
npm ci
npm run setup:env
npm run db:migrate
npm run db:seed
npm run dev
```

- Web: `http://localhost:5173`
- Gateway: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/api/docs`

Seed accounts are defined by `SEED_*` values in `.env`.

## Docker

```sh
npm run setup:env
docker compose up -d --build --wait
docker compose --profile seed run --rm --no-deps seed
```

Web: `http://localhost:8080`

## Login

`POST /api/auth/login`

```json
{
  "identifier": "employee@example.com or EMP-001",
  "password": "your-password"
}
```

Check-in and clock-out use `multipart/form-data` with a `photo` field. JPG and PNG files up to 5 MB are accepted.

## Tests

```sh
npm test
npm run test:integration
npm run test:browser
```

Integration and browser tests require a running MySQL database and seeded accounts.
API details are available in Swagger.
