# Job Application Tracker

A type-safe REST API backend for managing and tracking job applications, built with **Express.js**, **Prisma 8 (Prisma Next)**, **PostgreSQL**, **JWT authentication**, and **TypeScript**.

## Features

- **Authentication & Security:**
  - JWT-based authentication with bcrypt password hashing (10 salt rounds).
  - Defense-in-depth HTTP security headers via **Helmet**.
  - Cross-Origin Resource Sharing (**CORS**) with configurable origins.
  - Brute-force protection via **rate limiting** on login and global API endpoints.
- **User Profiles:**
  - Retrieve and update user profile information (`name`, `linkedinUrl`, `githubUrl`).
- **Application Tracking:**
  - Create, view, update, and delete applications with strict ownership isolation.
  - Track salary expectations (`salaryMin`, `salaryMax`, `currency`), work location (`jobLocation`), notes, and job posting URLs.
  - Status management: `Applied`, `Interviewing`, `Offered`, `Rejected`, `Accepted`, `Withdrawn`.
  - Automated status history audit timeline tracking every transition with timestamps.
  - Cursor-based pagination and filtering by status and company substring.
- **Interview Scheduling:**
  - Schedule interview rounds (`roundName`, `scheduledDate`, `meetingLink`, `interviewer`, `feedbackNotes`, `status`).
  - Update notes, reschedule dates, and track interview lifecycle (`Scheduled`, `Completed`, `Cancelled`).
- **Data Export & Admin:**
  - Streaming RFC 4180 compliant CSV export for application data.
  - Aggregated administrative metrics.
- **Interactive Documentation:**
  - Complete OpenAPI 3.0 specification rendered via Swagger UI at `/api-docs`.
- **Containerization & CI:**
  - Production-ready multi-stage `Dockerfile` and `docker-compose.yml` (PostgreSQL 16 + API).
  - GitHub Actions automated build and typecheck CI pipeline.

## Tech Stack

| Layer | Technology |
|---|---|
| Web Framework | Express.js 5 |
| Database | PostgreSQL 16+ |
| ORM | Prisma 8 (Prisma Next) |
| Auth & Security | JWT, Bcrypt, Helmet, CORS, Express-Rate-Limit |
| Language | TypeScript 5 |
| Documentation | Swagger UI Express (OpenAPI 3.0) |
| Containerization | Docker, Docker Compose |
| Runtime | Node.js 22+ |

## Project Structure

```
.
├── .github/workflows/ci.yml # Automated CI pipeline
├── Dockerfile              # Multi-stage production container definition
├── docker-compose.yml      # Orchestration for PostgreSQL and API
├── src/
│   ├── app.ts              # Express configuration, middleware, and route mounting
│   ├── index.ts            # Server entry point
│   ├── docs/
│   │   └── swagger.ts      # OpenAPI 3.0 specification & Swagger UI
│   ├── middleware/
│   │   ├── auth.ts         # JWT verification middleware
│   │   ├── rate-limiter.ts # Strict auth and general rate limiters
│   │   └── validate.ts     # Request payload validators
│   ├── prisma/
│   │   ├── db.ts           # Prisma 8 database client singleton
│   │   ├── contract.prisma # Data contract source
│   │   ├── contract.json   # Emitted contract metadata
│   │   └── contract.d.ts   # Generated TypeScript types
│   ├── routes/
│   │   ├── auth.ts         # /auth (signup, login, profile)
│   │   ├── applications.ts # /applications (CRUD, history, interviews)
│   │   ├── interviews.ts   # /interviews (CRUD by ID)
│   │   ├── admin.ts        # /admin/stats
│   │   └── export.ts       # /export/csv
│   └── types/
│       ├── express.d.ts    # Request augmentation (req.user)
│       └── prisma.d.ts     # Prisma runtime declaration
└── tests/
    └── applications.test.ts # Test suite
```

## Getting Started

### Option A: Docker Compose (Fastest)

Run both the PostgreSQL database and the API with a single command:

```bash
docker compose up --build
```

- API server: `http://localhost:3000`
- Interactive API docs: `http://localhost:3000/api-docs`
- PostgreSQL: `localhost:5432`

### Option B: Local Setup

#### Prerequisites
- Node.js 22+
- PostgreSQL 15+

#### 1. Clone and Install
```bash
git clone https://github.com/keerthivasank04/job-application-tracker.git
cd job-application-tracker
npm install
```

#### 2. Configure Environment Variables
Create a `.env` file in the root directory:
```env
DATABASE_URL="postgresql://username:password@localhost:5432/jobtracker"
JWT_SECRET="your-long-random-secret-key-here"
PORT=3000
ALLOWED_ORIGIN="*"
```

#### 3. Initialize Database and Emit Contract
```bash
npx prisma contract emit
npx prisma db init
```

#### 4. Run Development Server
```bash
npm run dev
```

## API Endpoints

| Method | Endpoint | Auth Required | Description |
|--------|----------|:---:|---|
| GET | `/health` | No | Server health check |
| GET | `/api-docs` | No | Interactive Swagger documentation |
| POST | `/auth/signup` | No | Register new account |
| POST | `/auth/login` | No (Rate limited) | Authenticate and obtain JWT token |
| GET | `/auth/profile` | Yes | Get authenticated user profile |
| PATCH | `/auth/profile` | Yes | Update profile (`name`, `linkedinUrl`, `githubUrl`) |
| GET | `/applications` | Yes | List applications (supports pagination, status, company query) |
| POST | `/applications` | Yes | Create a new job application |
| GET | `/applications/stats` | Yes | Get user analytics, status breakdown, and conversion rates |
| GET | `/applications/:id` | Yes | Get application by ID |
| PATCH | `/applications/:id` | Yes | Update application (auto-records status changes) |
| DELETE | `/applications/:id` | Yes | Delete application |
| POST | `/applications/:id/resume` | Yes | Upload resume file (.pdf, .doc, .docx max 5MB) |
| GET | `/applications/:id/resume` | Yes | Download attached resume file |
| DELETE | `/applications/:id/resume` | Yes | Remove attached resume file |
| GET | `/applications/:id/history` | Yes | Get status transition audit timeline |
| GET | `/applications/:id/interviews` | Yes | List scheduled interviews for an application |
| POST | `/applications/:id/interviews` | Yes | Schedule an interview round for an application |
| GET | `/interviews/:id` | Yes | Get interview details by ID |
| PATCH | `/interviews/:id` | Yes | Update interview details, notes, or status |
| DELETE | `/interviews/:id` | Yes | Delete/cancel an interview |
| GET | `/export/csv` | Yes | Stream all applications as RFC 4180 CSV |
| GET | `/admin/stats` | Yes | Aggregated system metrics |

## Query Parameters (GET /applications)

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | 10 | Results per page (max 100) |
| `cursor` | integer | - | Application ID for cursor-based pagination |
| `status` | string | - | Filter by status (`Applied`, `Interviewing`, etc.) |
| `company` | string | - | Case-insensitive company search filter |

## Available Scripts

```bash
npm run dev           # Start development server with hot reload
npm run build         # Compile TypeScript code to dist/
npm start             # Start production server
npm test              # Run test suite
npx prisma contract emit  # Emit Prisma 8 contract and type definitions
npx prisma db init    # Initialize database tables
```

## License

ISC
