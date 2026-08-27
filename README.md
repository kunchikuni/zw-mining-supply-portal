# ZW Supplier Portal

A local-supplier directory and RFQ platform connecting Zimbabwean mining companies with verified local suppliers — reducing procurement transaction costs and giving mines a way to track/report local content spend.

## Status: MVP (Phase 1) — backend + frontend

## 1. Architecture

```
┌─────────────────┐        REST/JSON        ┌──────────────────┐
│  Next.js (app)   │ ──────────────────────▶ │  NestJS API        │
│  React, client-  │ ◀────────────────────── │  (backend/)        │
│  side data fetch │       JWT bearer         │                    │
└─────────────────┘                          └────────┬───────────┘
                                                        │ Prisma ORM
                                                        ▼
                                              ┌──────────────────┐
                                              │   PostgreSQL      │
                                              └──────────────────┘
```

- **Frontend**: Next.js 14 (App Router), React, Tailwind. Client-rendered pages call the API directly via `fetch`; no server-side data layer yet (fine at MVP scale, revisit if SEO on the public directory becomes a priority — Server Components would fix that later without a rewrite).
- **Backend**: NestJS, modular by domain (`companies`, `documents`, `rfqs`, `bids`, `ratings`, `categories`, `auth`). Each module owns its controller/service/DTOs.
- **Database**: PostgreSQL via Prisma. Schema is the single source of truth for types on the backend; the frontend mirrors it by hand in `lib/types.ts` (see "known gaps" below for why, and the tradeoff).
- **Auth**: JWT, issued by the backend, stored client-side. See the note in `frontend/lib/auth.tsx` about hardening this for real production use.
- **Trust layer**: verification isn't cosmetic — `BidsService.create` (backend) rejects a bid unless the supplier's `verificationStatus` is `VERIFIED` and it's listed under the RFQ's category. This is the mechanism the whole product depends on, so it's enforced server-side, not just hidden in the UI.

### Why this stack

- NestJS over raw Express: the module/DI structure keeps `companies`, `rfqs`, `bids` etc. as separable units — matters once more than one engineer touches this.
- Prisma over a raw query builder: schema-as-code plus generated types remove a whole class of "column renamed, forgot to update the query" bugs.
- Next.js over CRA/Vite: gives you SSR/SEO for the public directory later (mines/suppliers should be Google-indexable) without a framework migration.
- Tailwind: fast to build consistent UI with a small team; the custom `copper`/`chrome` palette in `tailwind.config.ts` ties status colors to something visually related to mining rather than generic blue/green.

## 2. File structure

```
zw-supplier-portal/
├── README.md
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # source of truth for the data model
│   │   └── seed.ts             # starter procurement categories
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       ├── prisma/              # PrismaService, global module
│       ├── auth/                # register/login, JWT issuance
│       ├── companies/           # directory, search, verification status
│       ├── categories/          # procurement taxonomy
│       ├── documents/           # compliance doc intake + review queue
│       ├── rfqs/                # mine-posted requests for quote
│       ├── bids/                # supplier bids, eligibility-gated
│       └── ratings/             # post-job performance scores
└── frontend/
    ├── app/
    │   ├── layout.tsx           # AuthProvider + Navbar wrapper
    │   ├── page.tsx             # home
    │   ├── login/page.tsx
    │   ├── register/page.tsx    # 2-step: create company -> create user
    │   ├── companies/
    │   │   ├── page.tsx         # directory search
    │   │   └── [id]/page.tsx    # company profile
    │   └── rfqs/
    │       ├── page.tsx         # RFQ board
    │       ├── new/page.tsx     # mine posts an RFQ
    │       └── [id]/page.tsx    # RFQ detail + bid form
    ├── components/              # Navbar, CompanyCard, RfqCard, BidForm,
    │                             # BidList, DocumentUploadForm, DocumentList,
    │                             # SearchFilters, Badge, Button, EmptyState, etc.
    └── lib/
        ├── api.ts               # typed fetch client for every backend route
        ├── auth.tsx             # client-side auth context
        └── types.ts             # TS types mirroring the Prisma schema
```

## 3. Database schema

See `backend/prisma/schema.prisma`. Core entities: `Company` (mine or supplier), `User`, `Category`, `Document` (compliance verification), `Rfq`, `Bid`, `Rating`.

## 4. API endpoints

| Resource | Endpoints |
|---|---|
| `/auth` | `POST /register`, `POST /login` |
| `/companies` | `POST /`, `GET /` (search/filter), `GET /:id`, `POST /:id/categories`, `PATCH /:id/verification-status` |
| `/categories` | `GET /`, `POST /` |
| `/documents` | `POST /`, `GET /?companyId=`, `GET /review-queue`, `PATCH /:id/review` |
| `/rfqs` | `POST /`, `GET /` (open, filterable), `GET /:id`, `PATCH /:id/status` |
| `/bids` | `POST /`, `GET /?rfqId=`, `PATCH /:id/status` |
| `/ratings` | `POST /`, `GET /company/:id/average` |
| `/reporting` | `GET /local-content?mineCompanyId=` — the compliance dashboard's data source |

## 5. UI architecture

- **Routing**: Next.js App Router, one folder per route. Dynamic routes (`companies/[id]`, `rfqs/[id]`) fetch client-side on mount.
- **State**: no global store — `AuthProvider` (React Context) is the only cross-page state, holding the JWT and the decoded user. Everything else is local `useState` per page; there's no shared server-cache layer yet (no React Query/SWR). That's a deliberate MVP tradeoff — fine at this scale, worth adding once there are enough pages re-fetching the same data to matter.
- **Data flow**: page mounts → calls a typed function from `lib/api.ts` → renders loading skeleton → success or `ErrorBanner`. Every list view has a loading, empty, and error state — see `CompaniesPage` and `RfqsPage` for the pattern.
- **Component layering**:
  - **Primitives**: `Button`, `Badge`, `EmptyState`, `ErrorBanner`, `LoadingSkeleton` — no domain knowledge, reusable anywhere.
  - **Domain display**: `CompanyCard`, `RfqCard`, `VerificationBadge`, `RfqStatusBadge`, `BidList`, `DocumentList` — know about the data shape, render-only.
  - **Domain forms**: `SearchFilters`, `BidForm`, `DocumentUploadForm` — own their local state and call the API client directly.
- **Design tokens**: `copper` (accent / pending-state) and `chrome` (verified / success-state) in `tailwind.config.ts` — chosen to read as "mining industry" rather than generic SaaS blue, and reused consistently across every status badge so color carries real meaning site-wide.
- **Accessibility**: every form input has an associated `<label>`; buttons carry `aria-busy` while loading; focus-visible outline is set globally in `globals.css`.

## 6. Getting started

```bash
# Backend
cd backend
cp .env.example .env       # set DATABASE_URL and JWT_SECRET
npm install
npx prisma migrate dev --name init
npm run seed
npm run start:dev          # http://localhost:3000

# Frontend (separate terminal)
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                # http://localhost:3001 (or whatever port is free)
```

## Known gaps / next honest steps

- **Auth hardening**: JWT is still in `localStorage` (XSS-readable). Production should move to an httpOnly cookie + refresh-token pair. Route-level guards are now in place (see "Auth & authorization" below) — this remaining item is about the token's storage, not its enforcement.
- **Open self-registration into any company**: `POST /auth/register` lets anyone attach themselves as a `COMPANY_MEMBER` to *any* existing `companyId`, including one they didn't create — there's no invite/approval step. Found during the auth-guard review; not fixed yet. Before real companies onboard, this needs either an invite-code flow or a "first user becomes admin, everyone after needs admin approval" rule.
- **Ownership checks still missing on**: `PATCH /rfqs/:id/status`, `PATCH /bids/:id/status`, and `POST /companies/:id/categories` — all require a valid JWT now, but don't yet verify the caller owns the resource they're modifying. Flagged with `TODO` in each controller.
- **Type duplication**: `frontend/lib/types.ts` hand-mirrors `schema.prisma`. Fine at this size; once it drifts twice, generate the frontend types from the Prisma schema instead of hand-syncing.
- **File upload**: `DocumentUploadForm` takes a pasted link, not a real upload — presigned S3 upload is Phase 2.
- **No notifications**: RFQs don't yet fan out to matching suppliers (WhatsApp/SMS/email) — flagged in `RfqsService.create`.
- **RFQ detail is fully public, bids included**: anyone can see every supplier's bid amount on an open RFQ, not just the posting mine. Not addressed in this pass — worth a decision on whether that's actually the desired transparency model or needs restricting.

## Auth & authorization (added this pass)

- `JwtStrategy` + `JwtAuthGuard` — any route with `@UseGuards(JwtAuthGuard)` requires a valid bearer token; `req.user` is the decoded `{ sub, email, companyId, role }` payload.
- `JwtOptionalAuthGuard` — decodes the token if present but never rejects; used on `GET /companies/:id` so the directory stays public while owners/verifiers get a fuller view.
- `RolesGuard` + `@Roles(...)` — restricts a route to specific `UserRole` values. Currently used to lock `PATCH /companies/:id/verification-status` and the document review endpoints to `VERIFIER`/`PLATFORM_ADMIN`.
- **Company ID is never trusted from the client on a write.** `POST /rfqs`, `POST /bids`, and `POST /documents` all derive the acting company from the verified JWT (`user.companyId`), not from the request body — see each controller for the same comment explaining why.
- **Document links are privacy-gated.** `GET /companies/:id` redacts `fileUrl` on every document unless the requester is the owning company or a verifier/admin — found and fixed during this pass; previously any anonymous visitor could read a company's raw tax-clearance/CR6 links.
- Verified with `npm install` + `tsc --noEmit` + `next build` (frontend, all 10 routes) and a full manual trace of every guarded endpoint. **Not yet verified with a live server run** — this sandbox can't download the Prisma query engine binary (`binaries.prisma.sh` isn't reachable here), so run this once locally to confirm at runtime:
  ```bash
  cd backend && npx prisma migrate dev --name init && npm run start:dev
  # in another terminal:
  curl -i http://localhost:3000/reporting/local-content        # expect 401
  curl -i -X PATCH http://localhost:3000/companies/<id>/verification-status \
    -H "Authorization: Bearer <a COMPANY_MEMBER token>" -H "Content-Type: application/json" \
    -d '{"status":"VERIFIED"}'                                  # expect 403
  ```

## Working conventions

- No direct pushes to `main` — all work happens on feature branches
- Database is not touched directly outside of Prisma migrations
- All changes go through review before merge
