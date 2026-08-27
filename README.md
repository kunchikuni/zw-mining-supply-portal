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

- **Auth hardening**: JWT is in `localStorage` right now (XSS-readable). Production should move to an httpOnly cookie + refresh-token pair, and the backend controllers marked `TODO` need actual role guards — right now anyone can call `PATCH /companies/:id/verification-status`.
- **Type duplication**: `frontend/lib/types.ts` hand-mirrors `schema.prisma`. Fine at this size; once it drifts twice, generate the frontend types from the Prisma schema instead of hand-syncing.
- **File upload**: `DocumentUploadForm` takes a pasted link, not a real upload — presigned S3 upload is Phase 2.
- **No notifications**: RFQs don't yet fan out to matching suppliers (WhatsApp/SMS/email) — flagged in `RfqsService.create`.
- **Reporting endpoint needs auth scoping**: `GET /reporting/local-content` trusts `mineCompanyId` as a query param — once auth guards land, it should be derived from the JWT so a mine can only ever see its own numbers, not query another company's.

## Working conventions

- No direct pushes to `main` — all work happens on feature branches
- Database is not touched directly outside of Prisma migrations
- All changes go through review before merge
