# Job Application Tracker — System Architecture & Codebase Guide

This document provides a comprehensive technical overview of the Job Application Tracker backend, explaining its architecture, request lifecycle, data layer, security mechanisms, file-by-file implementation, and operational setup.

---

## Table of Contents
1. [High-Level Architecture & Design Principles](#1-high-level-architecture--design-principles)
2. [End-to-End Request Lifecycle](#2-end-to-end-request-lifecycle)
3. [Prisma 8 (Prisma Next) Contract-First Data Layer](#3-prisma-8-prisma-next-contract-first-data-layer)
4. [Security, Authentication & Data Isolation](#4-security-authentication--data-isolation)
5. [File-by-File Technical Deep Dive](#5-file-by-file-technical-deep-dive)
6. [Complete REST API Reference](#6-complete-rest-api-reference)
7. [DevOps, Docker & CI/CD](#7-devops-docker--cicd)
8. [Technical Interview Guide](#8-technical-interview-guide)

---

## 1. High-Level Architecture & Design Principles

The application is structured as a **Layered (N-Tier) Monolithic REST API** following separation of concerns:

```
+-------------------------------------------------------------------------+
|                              Client Layer                               |
|        (Frontend App / Postman / Swagger UI / Browser / cURL)           |
+-------------------------------------------------------------------------+
                                    |
                               HTTP Request
                                    v
+-------------------------------------------------------------------------+
|                         Security & Transport Layer                      |
|      - Helmet (HTTP security headers: HSTS, XSS protection, etc.)       |
|      - CORS (Cross-Origin Resource Sharing policy)                     |
|      - Rate Limiting (General & Auth-specific brute-force protection)   |
|      - Express JSON Body Parser (Max 100kb payload limit)               |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                             Routing Layer                               |
|   /health  |  /api-docs  |  /auth  |  /applications  |  /interviews     |
|            |             |         |  /export        |  /admin          |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                       Middleware / Pipeline Layer                       |
|   - Authentication Middleware (JWT verification, req.user hydration)    |
|   - Validation Middleware (Email/password format, status enums, types)  |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                          Business Logic Layer                           |
|   - Application CRUD & status transition audit trail                    |
|   - Ownership enforcement (Users can only read/mutate their own data)   |
|   - Interview scheduling & status lifecycle management                  |
|   - Memory-efficient streaming CSV generator (RFC 4180 compliant)       |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                           Data Access Layer                             |
|          Prisma 8 (Prisma Next) ORM Client (contract-first)             |
+-------------------------------------------------------------------------+
                                    |
                                SQL / TCP
                                    v
+-------------------------------------------------------------------------+
|                            Database Layer                               |
|                     PostgreSQL 16+ Relational DB                        |
+-------------------------------------------------------------------------+
```

### Key Architectural Decisions

1. **Separation of App Definition and Server Listening:**
   - `src/app.ts` defines and configures the Express application (routes, middleware) without calling `.listen()`.
   - `src/index.ts` imports `app` and binds to the network port.
   - **Why?** This enables integration testing via Supertest without binding to live TCP ports, preventing port collisions during automated test runs.

2. **Defense-in-Depth Security:**
   - Security is applied in layers: HTTP headers (`helmet`) -> origin check (`cors`) -> IP throttling (`express-rate-limit`) -> schema payload validation (`validate.ts`) -> cryptographic identity check (`auth.ts`) -> database record ownership verification.

3. **Data Isolation (Multi-Tenant Hygiene):**
   - Every read and mutation endpoint verifies that the resource's `userId` matches the authenticated user's `req.user.userId`. Users cannot inspect, update, or delete records belonging to others.

---

## 2. End-to-End Request Lifecycle

Here is the exact journey of a request, for example `PATCH /applications/42`:

1. **Client Sends Request:**
   `PATCH /applications/42` with header `Authorization: Bearer <jwt>` and body `{"status": "Interviewing"}`.
2. **Helmet Middleware:**
   Attaches security headers to the response object (`X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, etc.).
3. **CORS Middleware:**
   Verifies if the `Origin` header matches `ALLOWED_ORIGIN`. If options preflight, handles it immediately.
4. **Body Parser:**
   Reads incoming stream, parses JSON (rejecting bodies > 100kb), populates `req.body`.
5. **General Rate Limiter:**
   Tracks IP in memory. If request count exceeds 100 in 15 minutes, aborts with HTTP `429 Too Many Requests`.
6. **Router Matching:**
   Express router routes `/applications` to `applicationsRoutes`.
7. **Auth Middleware (`authMiddleware`):**
   - Reads `req.headers.authorization`.
   - Verifies `Bearer <token>` format.
   - Decodes and cryptographically verifies token against `process.env.JWT_SECRET`.
   - Attaches `{ userId, email }` to `req.user`.
8. **Validation Middleware (`validateUpdateApplication`):**
   - Verifies that `status` is one of the valid enum values (`Applied`, `Interviewing`, `Offered`, `Rejected`, `Accepted`, `Withdrawn`).
   - Calls `next()` if valid; otherwise halts with `400 Bad Request`.
9. **Route Handler:**
   - Extracts `req.params.id` as integer `42`.
   - Queries `db.orm.Application.where({ id: 42 }).first()`.
   - If not found: returns `404 Not Found`.
   - If found: checks `application.userId === req.user.userId`. If mismatch: returns `403 Forbidden`.
   - Executes database update: `db.orm.Application.where({ id: 42 }).update({ status: 'Interviewing' })`.
   - Detects status change from previous value -> creates audit log in `StatusHistory`:
     `db.orm.StatusHistory.create({ applicationId: 42, fromStatus: 'Applied', toStatus: 'Interviewing' })`.
10. **Response Serialization:**
    Express serializes updated application JSON and sends HTTP `200 OK`.

---

## 3. Prisma 8 (Prisma Next) Contract-First Data Layer

This project uses **Prisma 8 (`@prisma/orm-postgres`)**, the next-generation, contract-first relational ORM.

### Prisma 8 vs. Legacy Prisma
- **Legacy Prisma:** Generated a monolithic client (`@prisma/client`) with heavy native query engines (`.dll` / `.so` binaries).
- **Prisma 8 (Next):** Uses a **contract-first** approach. The schema is compiled into a lightweight AST JSON (`contract.json`) and TypeScript definitions (`contract.d.ts`). Queries are translated directly to SQL through a driver-adapted WebAssembly/pure runtime (`@prisma/orm-postgres/runtime`).

### Contract Schema (`src/prisma/contract.prisma`)

```prisma
model User {
  id           Int             @id @default(autoincrement())
  email        String          @unique
  passwordHash String
  name         String?
  linkedinUrl  String?
  githubUrl    String?
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @default(now())
  applications Application[]
}

model Application {
  id            Int             @id @default(autoincrement())
  company       String
  role          String
  status        String          @default("Applied")
  notes         String?
  salaryMin     Int?
  salaryMax     Int?
  currency      String?         @default("USD")
  jobLocation   String?
  jobPostUrl    String?
  appliedDate   DateTime        @default(now())
  userId        Int
  user          User            @relation(fields: [userId], references: [id])
  statusHistory StatusHistory[]
  interviews    Interview[]
}

model StatusHistory {
  id            Int         @id @default(autoincrement())
  applicationId Int
  application   Application @relation(fields: [applicationId], references: [id])
  fromStatus    String
  toStatus      String
  notes         String?
  changedAt     DateTime    @default(now())
}

model Interview {
  id            Int         @id @default(autoincrement())
  applicationId Int
  application   Application @relation(fields: [applicationId], references: [id])
  roundName     String
  scheduledDate DateTime
  meetingLink   String?
  interviewer   String?
  feedbackNotes String?
  status        String      @default("Scheduled")
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @default(now())
}
```

### Prisma Client Singleton (`src/prisma/db.ts`)

```typescript
import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };

export const db = postgres<Contract>({
  contractJson,
  url: process.env['DATABASE_URL'] || '',
});
```
- Access to models is type-safe: `db.orm.User`, `db.orm.Application`, `db.orm.StatusHistory`, `db.orm.Interview`.
- Emitting contracts is handled via `npx prisma contract emit`, which reads `contract.prisma` and writes `contract.json` and `contract.d.ts`.

---

## 4. Security, Authentication & Data Isolation

### 1. Password Hashing (Bcrypt)
- Passwords are never stored in plaintext.
- We use `bcrypt.hash(password, 10)`. The salt factor of 10 creates $2^{10} = 1024$ key expansion rounds, providing resistance against dictionary attacks and rainbow tables.
- Comparisons use `bcrypt.compare(password, user.passwordHash)`, which executes in constant time to prevent timing attacks.

### 2. Stateless JWT Authentication
- Upon successful login, the server signs a JSON Web Token:
  ```typescript
  jwt.sign({ userId: user.id, email: user.email }, secret, { expiresIn: '2h' })
  ```
- Expiration is capped at 2 hours.
- State is not stored in server memory, allowing horizontal scaling across multiple container instances.

### 3. TypeScript Declaration Merging (`src/types/express.d.ts`)
Standard Express `Request` has no `user` property. We augment the interface:
```typescript
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        email?: string;
      };
    }
  }
}
```
This guarantees compile-time safety whenever handlers access `req.user.userId`.

### 4. Rate Limiting Protection
- `authLimiter`: Max 5 requests per 15-minute window on `POST /auth/login`. This stops automated credential stuffing and dictionary attacks.
- `generalLimiter`: Max 100 requests per 15-minute window across standard endpoints to prevent DoS.

---

## 5. File-by-File Technical Deep Dive

### `src/index.ts`
- **Purpose:** Process entry point.
- **How it works:** Loads environment variables, imports `app` from `src/app.ts`, and executes `app.listen(PORT)` with logging.

### `src/app.ts`
- **Purpose:** Application factory and configuration.
- **How it works:** Attaches `helmet()`, `cors()`, `express.json()`, `generalLimiter`, Swagger documentation handler, and mounts sub-routers:
  - `/auth` -> `authRoutes`
  - `/applications` -> `applicationsRoutes`
  - `/interviews` -> `interviewRoutes`
  - `/admin` -> `adminRoutes`
  - `/export` -> `exportRoutes`

### `src/middleware/auth.ts`
- **Purpose:** Guard protected routes.
- **How it works:** Reads the `Authorization` header, extracts the token after `Bearer `, verifies the cryptographic signature with `jwt.verify`, and sets `req.user`. Returns `401 Unauthorized` if invalid or expired.

### `src/middleware/validate.ts`
- **Purpose:** Request validation layer.
- **Functions:**
  - `validateSignup`: Checks valid email pattern and minimum 8-character password.
  - `validateLogin`: Validates required fields.
  - `validateCreateApplication`: Checks non-empty company and role, valid status enum, and positive salary bounds (`salaryMin <= salaryMax`).
  - `validateUpdateApplication`: Partial update validation for application fields.
  - `validateUpdateProfile`: Validates optional name, LinkedIn, and GitHub strings.
  - `validateCreateInterview` & `validateUpdateInterview`: Validates round name, ISO 8601 date, and status enum (`Scheduled`, `Completed`, `Cancelled`).

### `src/middleware/rate-limiter.ts`
- **Purpose:** Rate-limiting policies using `express-rate-limit`.

### `src/routes/auth.ts`
- **Endpoints:**
  - `POST /signup`: Hashes password, normalizes email (`toLowerCase().trim()`), creates user record.
  - `POST /login`: Validates credentials, checks bcrypt hash, signs JWT token. Protected by `authLimiter`.
  - `GET /profile`: Returns authenticated user's details, stripping out `passwordHash`.
  - `PATCH /profile`: Updates user metadata (`name`, `linkedinUrl`, `githubUrl`).

### `src/routes/applications.ts`
- **Endpoints:**
  - `POST /`: Creates an application tied to `req.user.userId`.
  - `GET /`: Lists applications for the user. Supports `limit`, cursor-based pagination (`cursor`), status filter (`status`), and case-insensitive company search (`company`).
  - `GET /:id`: Fetches a single application verifying user ownership.
  - `PATCH /:id`: Updates application fields. If `status` changes from previous value, automatically writes an audit record to `StatusHistory`.
  - `DELETE /:id`: Deletes application with ownership verification.
  - `GET /:id/history`: Returns ordered audit timeline of all status changes.
  - `POST /:id/interviews`: Schedules an interview round for the application.
  - `GET /:id/interviews`: Lists all interviews for the application.

### `src/routes/interviews.ts`
- **Endpoints:**
  - `GET /:id`: Fetches interview details after verifying the parent application belongs to the calling user.
  - `PATCH /:id`: Updates interview notes, meeting links, or status.
  - `DELETE /:id`: Cancels/removes the interview record.

### `src/routes/export.ts`
- **Endpoints:**
  - `GET /csv`: Fetches applications for the user ordered by date. Streams CSV response using `for await...of` to prevent high memory usage. Escapes fields containing commas or quotes according to RFC 4180.

### `src/routes/admin.ts`
- **Endpoints:**
  - `GET /stats`: Aggregates user counts, total applications submitted, and last active application date using Prisma relations.

### `src/docs/swagger.ts`
- **Purpose:** OpenAPI 3.0 specification.
- **How it works:** Defines schemas and parameters for all endpoints and serves interactive documentation at `/api-docs`.

---

## 6. Complete REST API Reference

| Method | Path | Auth | Rate Limit | Description |
|---|---|:---:|:---:|---|
| `GET` | `/health` | No | General | Health check |
| `GET` | `/api-docs` | No | General | Interactive Swagger UI |
| `POST` | `/auth/signup` | No | General | User registration |
| `POST` | `/auth/login` | No | **Strict (5/15min)** | Authenticate and obtain JWT |
| `GET` | `/auth/profile` | **Yes** | General | Get user profile |
| `PATCH` | `/auth/profile` | **Yes** | General | Update profile details |
| `GET` | `/applications` | **Yes** | General | List applications (paginated) |
| `POST` | `/applications` | **Yes** | General | Create application |
| `GET` | `/applications/:id` | **Yes** | General | Get application by ID |
| `PATCH` | `/applications/:id` | **Yes** | General | Update application (auto-audits status) |
| `DELETE` | `/applications/:id` | **Yes** | General | Delete application |
| `GET` | `/applications/:id/history` | **Yes** | General | Get status history timeline |
| `GET` | `/applications/:id/interviews` | **Yes** | General | List interviews for application |
| `POST` | `/applications/:id/interviews` | **Yes** | General | Schedule interview round |
| `GET` | `/interviews/:id` | **Yes** | General | Get interview by ID |
| `PATCH` | `/interviews/:id` | **Yes** | General | Update interview details or status |
| `DELETE` | `/interviews/:id` | **Yes** | General | Cancel / delete interview |
| `GET` | `/export/csv` | **Yes** | General | Stream applications as CSV file |
| `GET` | `/admin/stats` | **Yes** | General | Aggregated user metrics |

---

## 7. DevOps, Docker & CI/CD

### 1. Docker Multi-Stage Build (`Dockerfile`)
- **Stage 1 (Builder):** Uses `node:22-alpine`, installs all dependencies, emits Prisma contract metadata, and compiles TypeScript into `dist/`.
- **Stage 2 (Runner):** Minimal alpine image, installs only production dependencies (`--omit=dev`), copies built artifacts, runs as non-root environment.

### 2. Docker Compose (`docker-compose.yml`)
Orchestrates two services:
1. `postgres`: PostgreSQL 16 image with persistent Docker volume and healthcheck using `pg_isready`.
2. `api`: Builds local Dockerfile, waits for Postgres health check to pass, binds port `3000`.

To start:
```bash
docker compose up --build
```

### 3. Continuous Integration (`.github/workflows/ci.yml`)
On every push and pull request to `main`:
1. Checks out repository.
2. Sets up Node.js 22 with npm cache.
3. Installs dependencies (`npm ci`).
4. Emits contract (`npx prisma contract emit`).
5. Executes typecheck and build (`npm run build`).

---

## 8. Technical Interview Guide

If asked about this project in an engineering interview, use the following structure:

### Q1: "Walk me through the architecture of your application."
> **Answer:** "I designed this backend as a type-safe, layered REST service in Node.js and TypeScript. I separated concerns into distinct tiers: a security and transport layer handling HTTP headers with Helmet, CORS, and rate limiting; a routing and validation middleware layer; a business logic layer that enforces strict multi-tenant ownership; and a contract-first data access layer using Prisma 8 connected to PostgreSQL. The Express application setup is decoupled from the HTTP listener to enable isolated integration testing."

### Q2: "How did you implement authentication and security?"
> **Answer:** "Authentication is stateless using JSON Web Tokens and Bcrypt. During signup, passwords are salted and hashed with 10 rounds. On login, constant-time hash comparison verifies credentials before issuing a 2-hour JWT. Protected routes pass through an authentication middleware that validates the cryptographic signature and hydrates the Express `Request` object with typed user context. To prevent brute-force attacks, I implemented strict rate limiting on the login route allowing a maximum of 5 attempts per 15 minutes. Beyond authentication, every mutation verifies that the requesting user owns the underlying resource, preventing unauthorized cross-user modifications."

### Q3: "What were the benefits of using Prisma 8?"
> **Answer:** "Prisma 8 is contract-first. Instead of maintaining generated binaries, the schema compiles into a lightweight contract definition with static TypeScript definitions. It allows end-to-end type safety from schema to query without runtime overhead, and produces clean, parameterized SQL queries that eliminate SQL injection risks."

### Q4: "How does the status audit trail work?"
> **Answer:** "When a user updates an application through `PATCH /applications/:id`, the handler compares the incoming status with the persisted record. If a transition occurred, it automatically writes a record into the `StatusHistory` table containing the previous status, new status, timestamp, and optional notes. This provides an audit log accessible via `GET /applications/:id/history` without requiring manual logging from the client."
