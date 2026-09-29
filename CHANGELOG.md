# Changelog

## 1.2.0: Job-portal interface

- Redesigned the dashboard in the style of a job portal:
  - a top nav with My jobs, Pipeline and Interviews (with a badge for upcoming interviews)
  - a "what / where" search bar, filter pills and stage tabs with counts
  - job cards with pay chips, status and interview tags, and a notes snippet
  - a sticky detail pane with a "View job posting" button, job details, interviews, resume, notes and activity
- The previous Kanban board lives on as the **Pipeline** tab. Clicking a card opens the job in My jobs.
- On phones, the detail pane opens as a full-screen sheet with a Back button.
- The account menu now holds profile, CSV export, theme toggle, API docs and sign out. The footer shows server status.
- Fixed: resume uploads failed with a 500 if the `uploads/` folder was deleted while the server was running. The folder is now created on demand.
- Fixed: changing a filter right after typing in the search box briefly used the old search text.
- The browser test (`npm run test:e2e`) covers the new layout, including mobile.

## 1.1.0: Frontend rebuild and stabilisation

### Critical fixes (the app could not work before these)
- **Every database query failed.** The code used `db.orm.User`, but the installed Prisma 8 release candidate namespaces models as `db.orm.public.User`. Updated all queries.
- **Every date read or write crashed on Node 22** (`RUNTIME.TEMPORAL_UNAVAILABLE`). Timestamp columns now use `TimestamptzString`, and responses are normalised to ISO 8601.
- **Deleting an application with interviews or history crashed** because of a foreign-key violation. Child rows are now deleted first.
- **The test suite couldn't start**: it ran through `ts-node`, which was never installed, and Jest's sandbox is incompatible with Prisma Next. Replaced with `node --test`, now 37 integration tests.
- **The Docker image could never start.** It ran `dist/src/index.js`, which the build never produced. It now runs through `tsx` as a non-root user, with a `migrate` service that creates the tables.
- Pinned the Prisma release-candidate versions exactly, so a fresh install can't pull in breaking changes.

### Frontend (rewritten)
- Old bugs: CSV export and resume download returned 401 (plain links can't send the auth token); "Forgot password" called a function that didn't exist; interviews could be created but never viewed, edited or deleted; optional fields couldn't be cleared; salary `0` disappeared; profile, password change and account deletion had no UI.
- New: board with drag-and-drop across all six statuses, list view, interviews view, detail drawer (status and notes, rounds, resume, timeline), search/filter/sort, profile & settings, full forgot/reset flow, dark mode, responsive layout, accessible dialogs, confirmation prompts, toasts, loading and empty states, live health indicator.
- No external CDNs (the Tailwind CDN build isn't meant for production), which allows a strict Content-Security-Policy.

### Backend improvements
- Login rate limiting counts only failed attempts. The general limit was raised from 100 to 1000 requests per 15 minutes; the old limit could lock out normal dashboard use.
- Expired reset tokens were accepted (a string was compared against a Date); they are now rejected.
- Pagination returned a spurious last page and filtered by company *after* limiting. Both are fixed.
- `GET /admin/stats` exposed every user's email to any logged-in user. It is now limited to `ADMIN_EMAILS`.
- Sensitive fields (`passwordHash`, reset tokens, server file paths) are stripped from all responses.
- Stricter validation: URLs, currency, integer salaries, lengths, the min/max salary check on update, and interview status on create.
- New: `GET /interviews`, `statusNote` on status changes, `appliedDate` on create/update, `name` on signup, 409 for duplicate emails, and `updatedAt` maintained on updates.
- CSV export: more columns, dated filename, formula-injection protection.
- Reset tokens are no longer written to production logs.
- CI now type-checks, verifies the generated contract, runs the tests against Postgres, and builds the Docker image.
