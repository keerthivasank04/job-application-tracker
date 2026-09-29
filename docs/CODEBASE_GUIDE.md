# Codebase Guide

How the Job Application Tracker is put together, and how a request travels through it.

## 1. The big picture

```
Browser (public/)                    Express server (src/)                     PostgreSQL
┌───────────────────────┐   HTTP    ┌──────────────────────────────────────┐   SQL   ┌──────────┐
│ index.html + app.css  │ ───────▶  │ helmet → cors → json → static files   │ ──────▶ │ user     │
│ js/app.js  (screens)  │  JSON +   │ → request log → rate limit            │         │ application
│ js/ui.js   (helpers)  │  Bearer   │ → /auth /applications /interviews     │ ◀────── │ interview│
│ js/api.js  (HTTP)     │  token    │   /export /admin  → 404 → errorHandler │         │ statusHistory
└───────────────────────┘           └──────────────────────────────────────┘         └──────────┘
```

One Node process serves both the **REST API** and the **dashboard**. The dashboard is plain static files, so there is no frontend build step, and because it is same-origin there are no CORS issues in normal use.

## 2. Backend

### Entry points
- **`src/index.ts`** starts the HTTP server, refuses to boot in production without a strong `JWT_SECRET` and a `DATABASE_URL`, and handles graceful shutdown on `SIGTERM`/`SIGINT`.
- **`src/app.ts`** builds the Express app. Middleware order matters:
  1. `json replacer`: every JSON response passes through `isoTimestampReplacer` (see §2.4).
  2. **Helmet** with a strict CSP (`script-src 'self'`). This works because the dashboard ships no inline scripts and no CDNs.
  3. **CORS** (`ALLOWED_ORIGIN`).
  4. **Body parser** (100 KB limit).
  5. **Static files** from `public/`, served *before* the rate limiter so page loads don't consume API budget.
  6. Request logging (silenced in tests), then the **general rate limiter**.
  7. Swagger UI at `/api-docs`, `/health`, the routers, a JSON **404** handler and the **central error handler**.

### Data layer: Prisma Next (Prisma 8)
- **`src/prisma/contract.prisma`** is the schema (the "data contract"). Four models: `User` → many `Application` → many `Interview` and `StatusHistory`.
- `npm run contract:emit` generates **`contract.json`** (runtime metadata) and **`contract.d.ts`** (types). Both are committed.
- `npm run db:init` creates or updates the tables. It is additive and idempotent.
- **`src/prisma/db.ts`** creates the client. Models live under the `public` namespace:
  ```ts
  await db.orm.public.Application.where({ userId }).orderBy((a) => a.id.desc()).limit(10).all();
  ```
- Timestamps use the **`TimestamptzString`** type (plain strings). The default `DateTime` type needs the JavaScript `Temporal` API, which Node 22 does not have.
- There are no `ON DELETE CASCADE` rules, so routes delete child rows (interviews, history) before parents.

### Routes (`src/routes/`)
| File | Responsibility |
|---|---|
| `auth.ts` | signup, login (JWT), profile read/update/delete, change/forgot/reset password |
| `applications.ts` | CRUD, list with cursor pagination and filters, stats, history, per-app interviews, resume upload/download/delete |
| `interviews.ts` | list all of a user's interviews (`?upcoming=true`), get/update/delete one round |
| `export.ts` | CSV export (RFC 4180 escaping plus spreadsheet-formula neutralising) |
| `admin.ts` | cross-user stats, restricted to `ADMIN_EMAILS` |

**Ownership.** Every `/applications/:id…` handler goes through `getOwnedApplication()`, which returns 400 for bad ids, 404 when the row is missing, and 403 when it belongs to someone else. Interviews use `getAuthorizedInterview()`, which checks the parent application's owner.

**Status history.** `PATCH /applications/:id` writes a `StatusHistory` row whenever `status` changes. An optional `statusNote` is stored with it.

**Pagination.** `GET /applications` fetches `limit + 1` rows. If the extra row exists, `nextCursor` is the last returned id; otherwise it is `null`. The `company` filter runs in SQL (`ILIKE`, with `%` and `_` escaped), so pages stay correct.

### Middleware (`src/middleware/`)
- `auth.ts` verifies the `Bearer` JWT and sets `req.user = { userId, email }`.
- `validate.ts` holds all request validation. Optional fields accept `null` to clear a value. URLs must be http(s), currency must be a 3-letter code, and salaries must be non-negative integers with min ≤ max.
- `upload.ts` uses multer disk storage in `uploads/resumes/` with random filenames, a PDF/DOC/DOCX allow-list (checks extension and MIME type) and a 5 MB cap.
- `rate-limiter.ts` has two limiters. The general one allows 1000 requests per 15 minutes. The auth one allows 10 **failed** attempts per 15 minutes; successful logins don't count. Both are disabled when `NODE_ENV=test`.
- `error-handler.ts` maps `AppError`, multer errors and malformed JSON to clean 4xx responses, and everything else to a generic 500.

### Serialisation (`src/utils/serialize.ts`)
PostgreSQL returns timestamps like `2026-09-29 05:31:57.33+00`, which some browsers can't parse. The Express JSON replacer rewrites them to ISO 8601 (`2026-09-29T05:31:57.330Z`). As a second safety net, it also drops `passwordHash`, `resetPasswordToken`, `resetPasswordExpires` and `resumePath` from every response.

### Password reset
`forgot-password` stores a **SHA-256 hash** of a random token with a one-hour expiry, and always answers 200 so attackers can't discover which emails have accounts. Email delivery is a stub (`src/services/email.ts`). Outside production, the raw token is also returned as `devResetToken` so the flow works locally. `reset-password` checks the hash and expiry, then clears the token so it can only be used once.

## 3. Frontend (`public/`)

The dashboard follows familiar job-portal conventions: a top nav, a "what / where" search, filter pills, and a two-column results page with a list of job cards and a sticky detail pane.

| File | Role |
|---|---|
| `index.html` | All markup: auth screen, header/nav, the three views (**My jobs**, **Pipeline**, **Interviews**), the detail pane, `<dialog>`s (job form, interview form, profile, confirm) and an SVG icon sprite. No inline JS. |
| `css/app.css` | Design tokens as CSS variables (blue accent, warm greys, 8px radii), light/dark themes, components, and responsive rules. Below 960px the detail pane turns into a full-screen sheet. |
| `js/api.js` | `request()` wrapper that attaches the token, turns errors into `ApiError`, and fires `auth:expired` on a 401. `download()` fetches protected files (CSV, resumes) as blobs, because plain links can't send the Authorization header. |
| `js/ui.js` | HTML escaping, safe-URL check, date/money formatting (`Intl`, e.g. "$150K – $180K a year"), status tab groups, toasts, busy buttons, dialog wiring, and a promise-based `confirmAction()`. |
| `js/app.js` | App state and screens: auth flows, data loading, search/filter/tab/sort logic, job list and detail pane, pipeline drag-and-drop, interviews, forms, profile, health indicator. |

**How the My jobs page works**
- `searchMatches()` applies the search box and filter pills. The tab counts are computed from that result, and `visibleApplications()` then narrows it to the active tab and sorts it.
- On desktop the first result is selected automatically, the way portal results pages behave. On mobile nothing opens until you tap a card, and the pane then opens as a sheet with a Back button.
- The detail pane fetches interviews and history lazily. It re-fetches when another job is selected, or after any change to the data (`detailStale`).
- Opening a job from Pipeline or Interviews switches to My jobs and selects it, clearing any filters that would hide it.

**Patterns worth knowing**
- **Rendering.** Views are rebuilt from `state` with template strings. Every user-supplied value goes through `esc()`, and links go through `safeUrl()`, which blocks `javascript:` URLs.
- **Events.** Handlers are attached once to containers (event delegation), so re-rendering never piles up duplicate listeners.
- **Optimistic updates.** Status changes update immediately and roll back if the API call fails.
- **Sessions.** The token is stored in `localStorage` (`jt.token`). Any 401 signs the user out with a message.

## 4. Testing

- `tests/routes.test.ts`: 404 handling, malformed JSON, security headers, and auth guards on every protected route.
- `tests/api.test.ts`: the full API against a real database, covering validation, auth flows (including expired and reused reset tokens), pagination, search, ownership, history, interviews, resumes, CSV, admin access and cascading deletes.
- `tests/e2e/dashboard.e2e.mjs`: a Playwright walkthrough of every screen. It fails on any unexpected console error or HTTP error.

Tests use Node's built-in runner (`node --test`) through `tsx`. Jest was dropped because its VM sandbox breaks Prisma Next's contract validation.

## 5. Common tasks

- **Add a field.** Edit `contract.prisma`, run `npm run contract:emit` and then `npm run db:init`. After that, update `validate.ts`, the route, `swagger.ts`, and the form in `index.html` / `app.js`.
- **Add an endpoint.** Add the route with `authMiddleware` and an ownership check, add validation, and document it in `swagger.ts`. Then add a test.
- **Real email.** Implement `EmailService.sendPasswordReset` with your provider. The frontend already handles the case where no `devResetToken` comes back.
