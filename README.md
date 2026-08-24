# ZW Supplier Portal

A local-supplier directory and RFQ platform connecting Zimbabwean mining companies with verified local suppliers — reducing procurement transaction costs and giving mines a way to track/report local content spend.

## Status: MVP scaffold (Phase 1)

This is the backend API scaffold: data model, company/supplier directory, document verification workflow, and RFQ → bid flow. No frontend yet, no payments, no live notifications.

## Stack

- **Backend**: NestJS (TypeScript) + Prisma ORM
- **Database**: PostgreSQL
- **Auth**: JWT (bcrypt password hashing)
- Frontend, file storage, and notifications are stubbed for Phase 2 (see `.env.example`)

## Getting started

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL and JWT_SECRET
npm install
npx prisma migrate dev --name init
npm run seed            # loads starter procurement categories
npm run start:dev
```

API runs on `http://localhost:3000` by default.

## Data model

See `backend/prisma/schema.prisma`. Core entities: `Company` (mine or supplier), `User`, `Category`, `Document` (compliance verification), `Rfq`, `Bid`, `Rating`.

Key rule enforced in `RfqsService.supplierIsEligible` / `BidsService.create`: a supplier can only bid on an RFQ if their `verificationStatus` is `VERIFIED` **and** they're listed under that RFQ's category. Verification isn't self-attested — it requires a `Document` to be reviewed and approved (see `DocumentsService.review`), matching how mines actually vet unfamiliar suppliers today (CR6/CR14 company registration, ZIMRA tax clearance, NSSA compliance certificate, safety/quality certs).

## API surface (v1)

| Resource | Endpoints |
|---|---|
| `/auth` | `POST /register`, `POST /login` |
| `/companies` | `POST /`, `GET /` (search/filter), `GET /:id`, `POST /:id/categories`, `PATCH /:id/verification-status` |
| `/categories` | `GET /`, `POST /` |
| `/documents` | `POST /`, `GET /?companyId=`, `GET /review-queue`, `PATCH /:id/review` |
| `/rfqs` | `POST /`, `GET /` (open, filterable), `GET /:id`, `PATCH /:id/status` |
| `/bids` | `POST /`, `GET /?rfqId=`, `PATCH /:id/status` |
| `/ratings` | `POST /`, `GET /company/:id/average` |

## Not yet built (intentional gaps)

- Route guards enforcing role checks (JWT auth is issued, but endpoints don't yet require/verify it — flagged with `TODO` comments in the controllers)
- File upload → object storage (documents currently just store a `fileUrl`; presigned S3-style upload flow is Phase 2)
- WhatsApp/SMS notifications when an RFQ matches a supplier's category
- Frontend (Next.js recommended — mobile-first, given patchy connectivity at rural mine sites)
- Local-content reporting dashboard (aggregate % of a mine's RFQ spend going to verified local suppliers — this is the compliance-facing feature that differentiates the platform)
- Payments/escrow (Paynow integration placeholder in `.env.example`)

## Roadmap

- **Phase 1 (this scaffold)**: directory + verification + RFQ/bid core, no payments
- **Phase 2**: local-content reporting dashboard, WhatsApp/SMS notifications, ratings surfaced in search, auth guards
- **Phase 3**: payments/escrow, deeper analytics, possible PRAZ/Chamber of Mines integration

## Working conventions

- No direct pushes to `main` — all work happens on feature branches (this scaffold was committed on `feature/mvp-scaffold`)
- Database is not touched directly outside of Prisma migrations
- All changes go through review before merge
