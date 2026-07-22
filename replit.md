# M-PESA Business Loans

A loan management platform for Kenyan small businesses. Customers apply for loans, manage repayments, and track their account via a dashboard. Loan officers and super-admins review applications, manage customers, and oversee the portfolio.

## Stack

- **Frontend**: React 19 + Vite 7, Tailwind CSS v4, shadcn/ui, wouter (routing), TanStack Query
- **Backend**: Express 5 (Node), TypeScript, esbuild
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: Replit Auth (OIDC) + email/password fallback
- **API**: Contract-first — OpenAPI spec → orval codegen → typed React hooks + Zod validators
- **Storage**: Replit App Storage (document uploads)

## Monorepo layout (pnpm workspaces)

```
artifacts/api-server/          Express API (port 8080)
artifacts/mpesa-business-loans/ React frontend (port from $PORT)
lib/db/                        Drizzle schema + migrations
lib/api-spec/                  OpenAPI YAML + orval config
lib/api-client-react/          Generated TanStack Query hooks
lib/api-zod/                   Generated Zod validators
lib/replit-auth-web/           Replit Auth React helpers
lib/object-storage-web/        File upload helpers
scripts/                       CLI utilities (seed, user management)
```

## First-time setup

After cloning or importing this repo into a fresh environment, run these once before starting the workflows:

```bash
pnpm install                          # install all workspace dependencies
pnpm --filter @workspace/db run push  # push Drizzle schema to the Replit-managed Postgres DB
```

The post-merge script (`scripts/post-merge.sh`) runs these two steps automatically after any task-agent merge.

## Running locally

Both workflows are pre-configured:
- **API Server** — `artifacts/api-server: API Server`
- **Frontend** — `artifacts/mpesa-business-loans: web`

Start both by pressing **Run**, or restart them individually from the Workflows panel.

## Admin credentials

On first API server start, a super-admin account is created automatically. Credentials are written to `admin-credentials.txt` in the workspace root. **Delete this file after noting the password and changing it on first login.**

Default admin email: `admin@mpesabusinessloans.com`

## Database

Schema is managed with Drizzle. To push schema changes to the database:

```bash
pnpm --filter @workspace/db run push
```

## API codegen

If you add or modify endpoints in `lib/api-spec/openapi.yaml`, regenerate the client:

```bash
pnpm --filter @workspace/api-spec run codegen
```

This regenerates both `lib/api-client-react/src/generated/api.ts` and `lib/api-zod/src/generated/api.ts`, then typechecks.

## User preferences

- Keep the existing pnpm monorepo structure
- Always run codegen after modifying `openapi.yaml`
