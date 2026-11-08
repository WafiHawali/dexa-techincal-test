# Dexa WFH Attendance System

## Technical Implementation Blueprint --- 5 Hari

Dokumen ini merupakan blueprint implementasi technical test Fullstack
Developer Dexa Group berdasarkan pilihan teknologi:

  Area                      Pilihan
  ------------------------- ------------------------------------------
  Frontend                  React + TypeScript + Vite
  Backend                   NestJS
  Database                  MySQL
  ORM                       Prisma
  Arsitektur                4 microservices + API Gateway
  Komunikasi antarlayanan   NestJS TCP transport
  Photo storage             Local filesystem dengan Multer
  Deployment                Docker Compose
  API documentation         Swagger
  Target pengerjaan         4 hari + 1 hari buffer (maksimal 5 hari)

------------------------------------------------------------------------

## 1. Analisis Requirement dan Scope

Berdasarkan brief recruiter, aplikasi memiliki dua aktor utama: Employee
dan HRD.

### 1.1 Employee Portal --- WFH Attendance

Fitur: - Login karyawan. - Dashboard informasi karyawan. - Check-in
WFH. - Capture tanggal dan waktu secara otomatis. - Upload foto sebagai
bukti sedang bekerja di rumah. - Riwayat absensi pribadi.

### 1.2 HRD Portal --- Employee Monitoring

Fitur: - Dashboard ringkasan absensi. - Master data karyawan. - Tambah
karyawan. - Edit data karyawan. - Melihat seluruh data absensi. -
Melihat detail absensi dan foto bukti.

HRD memiliki akses **view-only** terhadap data absensi. HRD tidak boleh
mengubah atau menghapus data absensi.

### 1.3 Fitur Tambahan dan Batasan Scope

GPS ditambahkan sebagai fitur pendukung absensi: aplikasi mengambil
koordinat latitude dan longitude satu kali ketika Employee melakukan
check-in. Fitur ini bukan live GPS tracking dan tidak memantau lokasi
karyawan secara terus-menerus.

Fitur berikut tidak menjadi prioritas dalam scope awal: - Face
recognition. - Approval workflow. - Payroll. - Shift scheduling. -
Notifikasi email. - Check-out.

Fokus utama tetap memenuhi requirement wajib dengan implementasi yang
stabil.

------------------------------------------------------------------------

## 2. Arsitektur Sistem

Sistem menggunakan React sebagai frontend dan NestJS sebagai backend.
Frontend berkomunikasi dengan API Gateway melalui HTTP REST. API Gateway
meneruskan request ke microservices menggunakan NestJS TCP transport.

### 2.1 Komponen

  Komponen             Tanggung jawab
  -------------------- --------------------------------------------------
  React Frontend       Employee Portal dan HRD Dashboard
  API Gateway          HTTP API, routing, request validation, JWT guard
  Auth Service         Login, password hashing, token
  Employee Service     CRUD karyawan dan profil
  Attendance Service   Check-in, validasi, riwayat absensi
  File Service         Upload, validasi, penyimpanan foto
  MySQL                Penyimpanan data relasional

### 2.2 Diagram Konseptual

``` text
                  React Frontend
                        |
                   HTTP / REST
                        |
                  API GATEWAY
                    NestJS
                        |
              Internal TCP Transport
                        |
       +----------------+----------------+
       |                |                |
   AUTH SERVICE   EMPLOYEE SERVICE  ATTENDANCE SERVICE
       |                |                |
       +----------------+----------------+
                        |
                   FILE SERVICE
                        |
                Local File Storage
                        |
                     MySQL
```

Diagram tersebut menggambarkan alur konseptual. Dalam implementasi,
setiap service memiliki ownership data masing-masing. Satu instance
MySQL dapat digunakan untuk development dengan pemisahan tabel secara
logis.

### 2.3 Pembagian Service

  Service              Tanggung jawab
  -------------------- --------------------------------------------------------
  API Gateway          HTTP entry point, routing, validasi request, JWT guard
  Auth Service         Login, password hashing, JWT
  Employee Service     CRUD master karyawan
  Attendance Service   Check-in, validasi absensi, riwayat
  File Service         Upload, validasi, dan penyimpanan foto

Terdapat empat backend microservices di luar API Gateway.

### 2.4 Komunikasi

-   Frontend ke API Gateway: HTTP REST.
-   API Gateway ke microservices: NestJS TCP transport.
-   File Service menangani penyimpanan foto.
-   Attendance Service menyimpan data absensi dan referensi file.
-   Setiap service hanya mengelola tabel sesuai ownership-nya.

Untuk deadline lima hari, TCP transport cukup untuk demonstrasi
komunikasi antarlayanan. Kafka atau RabbitMQ tidak menjadi kebutuhan
awal.

------------------------------------------------------------------------

## 3. Struktur Folder Project

Gunakan monorepo dengan npm workspaces agar frontend dan seluruh backend
service dapat dikelola dalam satu repository.

``` text
dexa-wfh-system/
│
├── apps/
│   ├── web/                    # React + Vite
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── layouts/
│   │   │   ├── pages/
│   │   │   │   ├── auth/
│   │   │   │   ├── employee/
│   │   │   │   └── hrd/
│   │   │   ├── services/
│   │   │   ├── hooks/
│   │   │   ├── contexts/
│   │   │   ├── types/
│   │   │   └── routes/
│   │   └── package.json
│   │
│   ├── api-gateway/
│   ├── auth-service/
│   ├── employee-service/
│   ├── attendance-service/
│   └── file-service/
│
├── packages/
│   └── shared-types/
│
├── infrastructure/
│   └── mysql/
│
├── uploads/
│
├── docker-compose.yml
├── .env.example
├── package.json
└── README.md
```

Gunakan npm workspaces. Nx atau Turborepo belum diperlukan karena dapat
menambah konfigurasi yang tidak terlalu membantu untuk deadline ini.

------------------------------------------------------------------------

## 4. Database Design

Gunakan MySQL dengan Prisma ORM.

### 4.1 Tabel Utama

  Tabel                 Fungsi
  --------------------- -----------------------
  `employees`           Master data karyawan
  `users`               Akun login dan role
  `attendances`         Data absensi
  `attendance_photos`   Metadata foto absensi

Role dapat disimpan sebagai enum pada tabel `users`, sehingga tidak
wajib membuat tabel `roles` terpisah untuk scope awal.

### 4.2 ERD

``` mermaid
erDiagram
    EMPLOYEES ||--o| USERS : has
    EMPLOYEES ||--o{ ATTENDANCES : submits
    ATTENDANCES ||--o{ ATTENDANCE_PHOTOS : contains

    EMPLOYEES {
        int id PK
        string employee_number UK
        string full_name
        string email UK
        string department
        string position
        string status
        datetime created_at
        datetime updated_at
    }

    USERS {
        int id PK
        int employee_id FK
        string password_hash
        enum role
        datetime created_at
    }

    ATTENDANCES {
        int id PK
        int employee_id FK
        date attendance_date
        datetime check_in_at
        enum status
        decimal latitude
        decimal longitude
        float gps_accuracy
        datetime created_at
    }

    ATTENDANCE_PHOTOS {
        int id PK
        int attendance_id FK
        string file_name
        string file_path
        string mime_type
        int file_size
        datetime created_at
    }
```

### 4.3 Data Ownership

  Service              Tabel
  -------------------- ---------------------
  Employee Service     `employees`
  Auth Service         `users`
  Attendance Service   `attendances`
  File Service         `attendance_photos`

Relasi lintas-service dikelola melalui ID dan API, bukan foreign key
lintas database service. Semua tabel dapat berada dalam satu database
MySQL untuk technical test, dengan ownership logis per service.

### 4.4 Business Rules

  ---------------------------------------------------------------------
  Rule                               Implementasi
  ---------------------------------- ----------------------------------
  Satu check-in per hari             Unique constraint
                                     `employee_id + attendance_date`

  Waktu absensi                      Dibuat oleh server

  Foto wajib                         Validasi sebelum absensi disimpan

  Employee access                    Hanya data milik sendiri

  HRD access                         Dapat melihat seluruh absensi

  HRD edit attendance                Dilarang

  Employee mengelola master data     Dilarang

  Koordinat GPS                      Diambil saat check-in; bukan live
                                     tracking

  Izin lokasi ditolak                Check-in meminta pengguna
                                     mengaktifkan izin lokasi
  ---------------------------------------------------------------------

Gunakan timezone `Asia/Jakarta` secara konsisten. Jika memungkinkan,
simpan timestamp dalam UTC dan konversikan saat ditampilkan.

### 4.5 Contoh Prisma Schema Awal

``` prisma
enum UserRole {
  EMPLOYEE
  HRD
}

enum EmployeeStatus {
  ACTIVE
  INACTIVE
}

enum AttendanceStatus {
  PRESENT
}

model Employee {
  id             Int            @id @default(autoincrement())
  employeeNumber String         @unique @map("employee_number")
  fullName       String         @map("full_name")
  email          String         @unique
  department     String?
  position       String?
  status         EmployeeStatus @default(ACTIVE)
  user           User?
  attendances    Attendance[]
  createdAt      DateTime       @default(now()) @map("created_at")
  updatedAt      DateTime       @updatedAt @map("updated_at")

  @@map("employees")
}

model User {
  id           Int      @id @default(autoincrement())
  employeeId   Int      @unique @map("employee_id")
  passwordHash String   @map("password_hash")
  role         UserRole @default(EMPLOYEE)
  employee     Employee @relation(fields: [employeeId], references: [id])
  createdAt    DateTime @default(now()) @map("created_at")

  @@map("users")
}

model Attendance {
  id             Int                 @id @default(autoincrement())
  employeeId     Int                 @map("employee_id")
  attendanceDate DateTime            @db.Date @map("attendance_date")
  checkInAt      DateTime            @map("check_in_at")
  status         AttendanceStatus    @default(PRESENT)
  latitude       Decimal?            @db.Decimal(10, 7)
  longitude      Decimal?            @db.Decimal(10, 7)
  gpsAccuracy    Float?              @map("gps_accuracy")
  employee       Employee            @relation(fields: [employeeId], references: [id])
  photos         AttendancePhoto[]

  @@unique([employeeId, attendanceDate])
  @@map("attendances")
}

model AttendancePhoto {
  id           Int        @id @default(autoincrement())
  attendanceId Int        @map("attendance_id")
  fileName     String     @map("file_name")
  filePath     String     @map("file_path")
  mimeType     String     @map("mime_type")
  fileSize     Int        @map("file_size")
  attendance   Attendance @relation(fields: [attendanceId], references: [id])

  @@map("attendance_photos")
}
```

Schema ini merupakan rancangan awal yang perlu disesuaikan dengan Prisma
Client dan kebutuhan migrasi. Tambahkan index pada kolom yang sering
digunakan untuk pencarian dan filtering.

------------------------------------------------------------------------

## 5. API Design

Seluruh endpoint frontend diakses melalui API Gateway.

  --------------------------------------------------------------------------
  Method         Endpoint                      Role           Fungsi
  -------------- ----------------------------- -------------- --------------
  POST           `/api/auth/login`             Public         Login

  GET            `/api/auth/me`                All            Profil
                                                              pengguna login

  GET            `/api/employees`              HRD            List karyawan

  POST           `/api/employees`              HRD            Tambah
                                                              karyawan

  GET            `/api/employees/:id`          HRD            Detail
                                                              karyawan

  PATCH          `/api/employees/:id`          HRD            Update
                                                              karyawan

  GET            `/api/attendances/me`         Employee       Riwayat
                                                              absensi
                                                              sendiri

  POST           `/api/attendances/check-in`   Employee       Submit absensi

  GET            `/api/attendances`            HRD            Monitoring
                                                              absensi

  GET            `/api/attendances/:id`        HRD            Detail absensi

  POST           `/api/files/upload`           Employee       Upload foto
                                                              (opsional jika
                                                              upload
                                                              digabung
                                                              dengan
                                                              check-in)
  --------------------------------------------------------------------------

### 5.1 Flow Check-in

``` text
Employee
   |
   | POST /api/attendances/check-in
   | multipart: photo
   v
API Gateway
   |
   +----> JWT validation
   |
   v
File Service
   |
   +----> Validate image
   +----> Store file
   |
   v
Attendance Service
   |
   +----> Check duplicate attendance
   +----> Validate received GPS coordinates
   +----> Generate server timestamp
   +----> Save attendance + GPS coordinates + photo metadata
   |
   v
Return success
```

Browser meminta izin lokasi melalui Geolocation API ketika Employee
menekan tombol check-in. Frontend mengirim latitude, longitude, dan
accuracy bersama foto ke API. Backend tetap membuat timestamp absensi
sendiri; jangan mempercayai waktu dari browser.

Lakukan pengecekan duplicate attendance sebelum upload file agar tidak
meninggalkan file yatim. Jika penyimpanan database gagal setelah upload,
lakukan cleanup file yang sudah tersimpan. Koordinat merupakan informasi
yang dilaporkan perangkat/browser dan bukan bukti lokasi yang tidak
dapat dimanipulasi. Minta izin lokasi hanya saat check-in dan jelaskan
tujuan penggunaannya.

### 5.2 Security

-   Password menggunakan bcrypt.
-   JWT memiliki expiry.
-   HRD dan Employee menggunakan role guard.
-   Employee ID berasal dari JWT, bukan request body.
-   File upload dibatasi ukuran, misalnya 5 MB.
-   Hanya JPG, JPEG, dan PNG.
-   Nama file dibuat random/UUID.
-   Direktori upload tidak mengizinkan eksekusi file.
-   HRD hanya mendapatkan akses GET untuk attendance.

------------------------------------------------------------------------

## 6. Frontend Design

Gunakan React + TypeScript + Vite.

### 6.1 Rekomendasi Library

  Kebutuhan         Library
  ----------------- -----------------
  Routing           React Router
  API               Axios
  Server state      TanStack Query
  Form              React Hook Form
  Validation        Zod
  Styling           Tailwind CSS
  Icons             Lucide React
  Date formatting   date-fns

### 6.2 Employee Routes

``` text
/login
/employee/dashboard
/employee/attendance
/employee/history
/employee/profile
```

### 6.3 HRD Routes

``` text
/hrd/dashboard
/hrd/employees
/hrd/employees/create
/hrd/employees/:id/edit
/hrd/attendances
/hrd/attendances/:id
```

### 6.4 Halaman Utama

**Employee Dashboard** - Nama dan informasi karyawan. - Tanggal. -
Status absensi. - Tombol check-in.

**Attendance Form** - Input foto. - Preview gambar. - Ambil koordinat
GPS saat tombol check-in ditekan melalui browser Geolocation API. -
Tampilkan status izin/lokasi dan koordinat yang berhasil diperoleh. -
Konfirmasi check-in.

Koordinat yang disimpan: `latitude`, `longitude`, dan `gpsAccuracy`
(accuracy dalam meter, jika tersedia). Jangan melakukan pelacakan lokasi
di background atau secara terus-menerus.

**HRD Employee Management** - Tabel karyawan. - Pencarian. - Tambah
karyawan. - Edit karyawan.

**Attendance Monitoring** - Tabel absensi. - Filter tanggal. - Filter
nama karyawan. - Detail absensi dan foto.

Untuk upload foto, gunakan input file dengan preview. Integrasi kamera
menggunakan `getUserMedia()` dapat menjadi tambahan, tetapi jangan
sampai menghambat fitur utama. Brief mewajibkan upload foto, bukan
integrasi kamera secara khusus.

------------------------------------------------------------------------

## 7. Rencana Pengerjaan 5 Hari

Targetnya adalah menyelesaikan fitur utama pada hari keempat dan
menggunakan hari kelima untuk pengujian serta finalisasi.

### Day 1 --- Setup & Architecture

**Target:** seluruh aplikasi berjalan dan Gateway berhasil berkomunikasi
dengan service.

-   [ ] Setup monorepo dan npm workspaces.
-   [ ] Setup React + Vite + TypeScript.
-   [ ] Setup lima NestJS applications (empat services + Gateway).
-   [ ] Setup MySQL dan Prisma.
-   [ ] Buat schema dan migration.
-   [ ] Setup TCP communication.
-   [ ] Buat endpoint health check.

**Output:** aplikasi berjalan, database terkoneksi, dan Gateway dapat
memanggil service.

### Day 2 --- Core Backend

**Target:** backend menjalankan kebutuhan utama.

-   [ ] Login dan JWT.
-   [ ] Password hashing.
-   [ ] Role-based authorization.
-   [ ] Employee CRUD.
-   [ ] Attendance check-in.
-   [ ] Ambil koordinat GPS saat check-in menggunakan Geolocation API.
-   [ ] Simpan latitude, longitude, dan accuracy pada data attendance.
-   [ ] Attendance history.
-   [ ] File upload menggunakan Multer.
-   [ ] Validasi duplicate attendance.

**Output:** API utama berfungsi dan dapat diuji melalui Postman.

### Day 3 --- Frontend Development

**Target:** kedua portal tersedia.

-   [ ] Login page.
-   [ ] Protected routes.
-   [ ] Employee dashboard.
-   [ ] Attendance form.
-   [ ] Attendance history.
-   [ ] HRD dashboard.
-   [ ] Employee management.
-   [ ] Attendance monitoring.

**Output:** seluruh halaman selesai dengan mock data atau API yang sudah
tersedia.

### Day 4 --- Integration

**Target:** seluruh flow berjalan tanpa mock data.

-   [ ] Integrasi seluruh API.
-   [ ] Uji login Employee.
-   [ ] Uji login HRD.
-   [ ] Uji upload foto.
-   [ ] Uji pengambilan koordinat GPS saat check-in.
-   [ ] Uji kondisi izin lokasi ditolak atau lokasi tidak tersedia.
-   [ ] Uji check-in.
-   [ ] Uji HRD monitoring.
-   [ ] Uji role permission.
-   [ ] Perbaiki error dan UI.

**Output:** aplikasi layak didemonstrasikan.

### Day 5 --- Quality & Submission

**Target:** aplikasi siap dikirim kepada recruiter.

-   [ ] Docker Compose.
-   [ ] Seed data.
-   [ ] README installation.
-   [ ] Dokumentasi arsitektur.
-   [ ] Swagger API documentation.
-   [ ] Testing dan bug fixing.
-   [ ] Screenshot aplikasi.
-   [ ] Final GitHub repository.

**Output:** repository siap direview dan dipresentasikan.

### Catatan Prioritas

Jangan menunggu seluruh backend selesai baru mulai frontend. Mulai
frontend dengan kontrak API dan data dummy sejak hari kedua atau ketiga
agar integrasi tidak menumpuk pada hari keempat.

------------------------------------------------------------------------

## 8. Testing Checklist dan Acceptance Criteria

### Authentication

-   [ ] Employee berhasil login.
-   [ ] HRD berhasil login.
-   [ ] Password salah ditolak.
-   [ ] Endpoint private menolak request tanpa JWT.
-   [ ] Employee tidak bisa mengakses endpoint HRD.

### Employee

-   [ ] HRD berhasil menambahkan karyawan.
-   [ ] HRD berhasil mengubah data karyawan.
-   [ ] Employee dapat melihat profil sendiri.
-   [ ] Employee tidak bisa mengakses data karyawan lain.

### Attendance

-   [ ] Employee berhasil check-in dengan foto.
-   [ ] Browser meminta izin lokasi saat check-in.
-   [ ] Latitude dan longitude tersimpan pada data absensi.
-   [ ] GPS accuracy tersimpan jika tersedia dari browser.
-   [ ] Jika izin lokasi ditolak atau lokasi gagal diperoleh, check-in
    ditahan dan pengguna diberi instruksi yang jelas.
-   [ ] Timestamp dibuat oleh server.
-   [ ] Employee tidak bisa check-in dua kali pada tanggal yang sama.
-   [ ] Employee dapat melihat riwayat absensi sendiri.
-   [ ] HRD dapat melihat seluruh absensi.
-   [ ] HRD tidak dapat mengubah atau menghapus absensi.

### File & Deployment

-   [ ] File selain JPG/PNG ditolak.
-   [ ] File lebih dari batas ukuran ditolak.
-   [ ] Foto dapat ditampilkan kembali.
-   [ ] Docker Compose menjalankan aplikasi dan database.
-   [ ] README dapat diikuti untuk instalasi dari awal.

------------------------------------------------------------------------

## 9. Hal yang Perlu Dihindari

  ---------------------------------------------------------------------
  Kesalahan                          Solusi
  ---------------------------------- ----------------------------------
  Terlalu lama setup microservices   Buat komunikasi TCP sederhana
                                     terlebih dahulu

  Semua logic dimasukkan Gateway     Business logic tetap di service
                                     masing-masing

  Semua service bebas mengakses      Terapkan data ownership
  semua tabel                        

  Menggunakan jam browser            Gunakan server timestamp

  Upload foto tanpa validasi         Gunakan file filter dan size limit

  Membuat UI terlalu kompleks        Prioritaskan usability

  Tidak punya seed data              Buat akun demo Employee dan HRD

  Dokumentasi dikerjakan terakhir    Buat README sejak hari pertama
  ---------------------------------------------------------------------

**Catatan arsitektur:** jangan mengklaim sistem sudah benar-benar
terisolasi secara database jika semua service menggunakan satu schema
dan satu Prisma client. Jelaskan bahwa ini merupakan deployment
sederhana dengan logical data ownership untuk kebutuhan technical test.

------------------------------------------------------------------------

## 10. Development Workflow dan Tools

  Tools              Penggunaan
  ------------------ ---------------------
  VS Code / Cursor   Development
  Git                Version control
  Postman            API testing
  MySQL              Database
  Prisma Studio      Database inspection
  Docker Compose     Local environment
  Swagger            API documentation
  GitHub             Submission

### Contoh Git Commit

``` text
chore: initialize monorepo
feat: setup nestjs microservices
feat: implement authentication
feat: implement employee management
feat: implement attendance service
feat: implement photo upload
feat: build employee portal
feat: build HRD dashboard
test: add integration tests
docs: add project documentation
```

Push ke GitHub secara bertahap. Jangan menunggu hari terakhir.

------------------------------------------------------------------------

## 11. Strategi Penggunaan AI

AI dapat digunakan secara terstruktur untuk mempercepat development.

  Pekerjaan         Penggunaan AI
  ----------------- --------------------------------------
  Database design   Review ERD dan constraint
  NestJS            Generate module, controller, service
  Prisma            Generate schema dan migration awal
  React             Generate komponen reusable
  Testing           Generate unit dan integration test
  Debugging         Analisis error berdasarkan log
  Documentation     Generate README dan API docs

Tiga aturan: 1. Jangan menerima kode tanpa membaca dan memahami isinya.
2. Jalankan test setelah perubahan yang dibantu AI. 3. Pastikan dapat
menjelaskan alur request dari React sampai database.

Persiapkan penjelasan untuk pertanyaan seperti: - Mengapa menggunakan
TCP? - Mengapa service dipisahkan? - Bagaimana mencegah duplicate
attendance? - Bagaimana mengamankan upload foto? - Bagaimana menangani
kegagalan upload atau penyimpanan database?

------------------------------------------------------------------------

## 12. Langkah Pertama Implementasi

Mulai dari fondasi project.

``` bash
# 1. Create project
mkdir dexa-wfh-system
cd dexa-wfh-system

# 2. Initialize npm
npm init -y

# 3. Create workspace structure
mkdir apps packages infrastructure

# 4. Initialize git
git init
```

Kemudian setup: - npm workspaces. - React + Vite. - NestJS Gateway. -
Empat NestJS microservices. - MySQL menggunakan Docker. - Prisma schema.

**Target Day 1:** semua aplikasi bisa start dan Gateway berhasil
berkomunikasi dengan Auth Service melalui TCP.

Jangan lanjut ke CRUD sebelum fondasi komunikasi ini benar-benar
bekerja.

------------------------------------------------------------------------

## 13. Ringkasan Keputusan Final

  Area             Keputusan
  ---------------- --------------------
  Architecture     Microservices
  Backend          NestJS
  Frontend         React + TypeScript
  Database         MySQL
  ORM              Prisma
  Communication    TCP
  Authentication   JWT + bcrypt
  File upload      Multer
  Storage          Local filesystem
  Deployment       Docker Compose
  API docs         Swagger
  Deadline         Maksimal 5 hari

## Prinsip Pengerjaan

Buat aplikasi yang sederhana dari sisi operasional, tetapi kuat dari
sisi engineering.

Prioritaskan: 1. Semua requirement wajib terpenuhi. 2. Business logic
benar. 3. Security dan authorization berjalan. 4. Frontend dan backend
terintegrasi. 5. Aplikasi dapat dijalankan dari dokumentasi. 6. Setiap
keputusan teknis dapat dijelaskan saat technical interview.

Repository referensi dari kandidat lain dapat digunakan sebagai
pembanding struktur dan fitur, tetapi implementasi akhir harus memiliki
keputusan arsitektur dan kode sendiri.
