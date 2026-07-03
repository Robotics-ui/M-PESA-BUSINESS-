# M-PESA Business Loans

A role-based loan management system for Kenyan small businesses. Customers apply for working-capital loans; loan officers review applications; super-admins manage the platform.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, `wouter`, shadcn/ui, Tailwind CSS |
| Backend | Express 5 (Node 24) |
| Database | PostgreSQL (Replit-managed) via Drizzle ORM |
| Auth | Replit Auth (OIDC, `passport-replit-auth`) + email/password fallback |
| Storage | Replit App Storage (document uploads) |
| API contract | OpenAPI spec → Orval-generated React Query hooks |

## Monorepo layout

```
artifacts/api-server/        Express API (port 8080 in dev)
artifacts/mpesa-business-loans/  React frontend (port 22025 in dev)
lib/db/                      Drizzle schema + migrations
lib/api-spec/                openapi.yaml (source of truth)
lib/api-zod/                 Generated Zod schemas (from openapi.yaml)
lib/replit-auth-web/         Shared Replit Auth React hook
scripts/                     CLI utilities (promote-user, etc.)
```

## Running locally

```bash
pnpm install                          # install all workspace deps
pnpm --filter @workspace/db push      # sync DB schema
# start both servers (two terminals or via Replit workflows):
pnpm --filter @workspace/api-server dev
pnpm --filter @workspace/mpesa-business-loans dev
```

## First-time admin setup

On first startup, the API server creates a super-admin account and writes credentials to `admin-credentials.txt` in the project root. Sign in, change the password, and delete the file.

To promote any signed-in user to a different role:

```bash
pnpm --filter @workspace/scripts promote-user <email> <role>
# role: super_admin | loan_officer | customer
```

## Regenerating API types

After editing `lib/api-spec/openapi.yaml`:

```bash
pnpm --filter @workspace/api-spec codegen
```

## User preferences

- Keep the project's existing pnpm monorepo structure.
- Do not restructure or migrate the codebase unless explicitly asked.
