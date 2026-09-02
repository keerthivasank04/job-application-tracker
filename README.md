# Job Application Tracker

A type-safe REST API backend for tracking your job applications, built with **Express.js**, **Prisma 8 (Prisma Next)**, **PostgreSQL**, **JWT authentication**, and **TypeScript**.

## Features

- User registration and login with JWT authentication
- Create, view, update, and delete job applications
- Filter applications by status and company name
- Cursor-based pagination for large datasets
- Export your applications as CSV (memory-efficient streaming)
- Admin statistics dashboard
- Input validation on all endpoints
- Ownership enforcement — users can only access their own data
- Full TypeScript type safety with Prisma 8 contract-first ORM

## Tech Stack

| Layer | Technology |
|---|---|
| Web Framework | Express.js 5 |
| Database | PostgreSQL 15+ |
| ORM | Prisma 8 (Prisma Next) |
| Auth | JWT (jsonwebtoken) + Bcrypt |
| Language | TypeScript 5 |
| Testing | Jest + Supertest |
| Runtime | Node.js 22+ |

## Project Structure

```
src/
├── app.ts                  # Express app setup and route mounting
├── index.ts                # Server entry point (starts HTTP listener)
├── middleware/
│   ├── auth.ts             # JWT verification middleware
│   └── validate.ts         # Input validation middleware
├── prisma/
│   ├── db.ts               # Prisma 8 database client (singleton)
│   ├── contract.prisma     # Data contract (models definition)
│   ├── contract.json       # Generated runtime schema (do not edit)
│   └── contract.d.ts       # Generated TypeScript types (do not edit)
├── routes/
│   ├── auth.ts             # POST /auth/signup, POST /auth/login
│   ├── applications.ts     # CRUD for /applications
│   ├── admin.ts            # GET /admin/stats
│   └── export.ts           # GET /export/csv
└── types/
    ├── express.d.ts        # Augments Express Request with req.user
    └── prisma.d.ts         # Module declaration for Prisma 8 runtime
tests/
└── applications.test.ts    # Integration tests (Jest + Supertest)
```

## Getting Started

### Prerequisites
- Node.js 22+
- PostgreSQL 15+

### 1. Clone and Install
```bash
git clone https://github.com/keerthivasank04/job-application-tracker.git
cd job-application-tracker
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory:
```env
DATABASE_URL="postgresql://username:password@localhost:5432/jobtracker"
JWT_SECRET="your-long-random-secret-key-here"
PORT=3000
```

### 3. Initialize the Database
```bash
npx prisma db init
```

### 4. Start the Development Server
```bash
npm run dev
```

Server runs at: `http://localhost:3000`

## API Endpoints

| Method | Endpoint | Auth Required | Description |
|--------|----------|:---:|---|
| GET | `/health` | Health check |
| POST | `/auth/signup` |Register a new user |
| POST | `/auth/login` |Login and receive JWT token |
| GET | `/applications` |List your applications (paginated) |
| POST | `/applications` |Create a new application |
| GET | `/applications/:id` | Get a single application |
| PATCH | `/applications/:id` | Update an application |
| DELETE | `/applications/:id` | Delete an application |
| GET | `/export/csv` | Download all applications as CSV |
| GET | `/admin/stats` | Aggregated user statistics |

### Query Parameters (GET /applications)
| Parameter | Description | Example |
|---|---|---|
| `limit` | Results per page (default 10, max 100) | `?limit=20` |
| `cursor` | ID to paginate from (from `nextCursor`) | `?cursor=15` |
| `status` | Filter by status | `?status=Applied` |
| `company` | Filter by company name (partial match) | `?company=Google` |

### Valid Application Statuses
`Applied` · `Interviewing` · `Offered` · `Rejected` · `Accepted` · `Withdrawn`

## Usage Examples

### Register
```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{ "email": "john@example.com", "password": "SecurePass123" }'
```

### Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "john@example.com", "password": "SecurePass123" }'
# Returns: { "token": "eyJ..." }
```

### Create Application
```bash
curl -X POST http://localhost:3000/applications \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "company": "Google", "role": "Backend Engineer", "status": "Applied" }'
```

### List Applications
```bash
curl http://localhost:3000/applications?status=Applied \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Export as CSV
```bash
curl http://localhost:3000/export/csv \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o applications.csv
```

## Available Scripts

```bash
npm run dev          # Start development server with hot-reload
npm run build        # Compile TypeScript to dist/
npm start            # Start production server
npm test             # Run test suite
npx prisma db init   # Initialize database tables
npx prisma contract emit  # Regenerate Prisma 8 contract types
```

## Security

- Passwords are hashed with **bcrypt** (10-round salt) — never stored as plaintext
- JWT tokens expire after **2 hours**
- Each user can only access **their own applications** (ownership check on every write)
- Input validation prevents malformed or dangerous data from reaching the database
- Prisma 8 generates parameterized SQL queries, preventing SQL injection

## License

ISC
