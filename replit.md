# M-PESA Business Loans

A role-based loan management system for small business owners in Kenya to apply for, track, and repay working-capital loans, with staff tools for reviewing applications and managing customers.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/mpesa-business-loans run dev` — run the web frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run promote-user <email> <super_admin|loan_officer|customer>` — promote a user to a role after their first login via Replit Auth
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, session auth via Replit Auth (OIDC)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec) → React Query hooks in `@workspace/api-client-react`
- Frontend: React + Vite, wouter routing, shadcn/ui, Tailwind
- Object storage: Replit App Storage for ID photos, selfies, supporting documents
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for the API contract (schemas, routes)
- `artifacts/api-server/src/routes/` — Express route handlers (auth, profile, loans, admin, notifications, storage)
- `artifacts/api-server/src/middlewares/authMiddleware.ts` — role/session guards
- `artifacts/mpesa-business-loans/src/App.tsx` — role-based routing (customer vs. staff vs. suspended vs. landing)
- `artifacts/mpesa-business-loans/src/pages/customer/` and `/admin/` — feature pages
- `lib/replit-auth-web/src/use-auth.ts` — shared `useAuth()` hook (user, isAuthenticated, login, logout)
- `lib/object-storage-web/` — `ObjectUploader` / `useUpload` for presigned uploads
- `scripts/src/promote-user.ts` — CLI to assign a role to a user by email

## Architecture decisions

- Auth is Replit Auth only (OIDC) — there is no separate register/login form. New users default to the `customer` role; staff roles are granted via the `promote-user` script after first login.
- OTP phone verification is stubbed: `useRequestPhoneOtp` returns the code directly in `devCode` since no SMS provider is connected yet (Phase 1 foundation, by design).
- No automated credit scoring — loan approve/reject/hold decisions are manual, made by staff with optional review notes.
- Document/photo uploads use a two-step presigned URL flow (`useRequestUploadUrl` + direct PUT), not proxied through the API server.

## Product

- **Customers**: register/verify phone via OTP, complete profile (ID front/back, selfie, supporting docs), apply for loans, track application status, view repayment schedules, manage notifications.
- **Staff (loan officers, super admin)**: dashboard with portfolio stats, customer management (suspend/activate), loan application review (approve/reject/hold with notes), audit log, system settings (super admin only).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm run typecheck` after touching `lib/api-spec/openapi.yaml` or regenerating with Orval — schema changes ripple into both the API server and the generated React Query hooks.
- A user must log in once via Replit Auth before `promote-user` can find their row to promote them to `loan_officer`/`super_admin`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
