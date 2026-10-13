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
- Tailwind: fast to build consistent UI with a small team; the warm ivory / gold / muted-green palette in `tailwind.config.ts` reads as considered and industry-appropriate rather than generic SaaS blue, and ties status colours to consistent meanings (see "UI architecture").

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
│       ├── auth/                # register/login, JWT issuance, invite codes
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
    │   ├── bids/
    │   │   └── mine/page.tsx    # a supplier's bids across every RFQ, with outcome + withdraw
    │   └── rfqs/
    │       ├── page.tsx         # RFQ board (biddable RFQs only)
    │       ├── new/page.tsx     # mine posts an RFQ
    │       ├── mine/page.tsx    # every RFQ the caller's company posted, any status
    │       └── [id]/page.tsx    # RFQ detail + bid form (suppliers) / manage + review bids (owner)
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
| `/auth` | `POST /register` (needs an `inviteCode`), `POST /login` |
| `/companies` | `POST /` (returns the first-admin `inviteCode`), `GET /` (search/filter), `GET /:id`, `POST /:id/categories` (add), `PUT /:id/categories` (replace the whole listing), `POST /:id/invites` (company admin), `PATCH /:id/verification-status` |
| `/categories` | `GET /`, `POST /` (platform admin only) |
| `/documents` | `POST /`, `GET /?companyId=`, `GET /review-queue`, `PATCH /:id/review` |
| `/rfqs` | `POST /`, `GET /` (still-biddable, filterable; optional auth also returns the caller's own expired RFQs), `GET /mine` (all of the caller's RFQs, any status), `GET /:id` (bids sealed: everyone gets the count, only the posting mine gets every bid, a bidder gets its own), `PATCH /:id/status` (owner: close or cancel) |
| `/bids` | `POST /`, `GET /?rfqId=` (sign-in and `rfqId` required; same sealed rule), `GET /mine` (the caller's bids across every RFQ, each with its RFQ), `PATCH /:id/status` (owner: shortlist/accept/reject; bidder: withdraw — accept also awards the RFQ) |
| `/ratings` | `POST /` (sign-in; the posting mine rates a supplier it accepted on an awarded RFQ, once), `GET /company/:id/average` (public aggregate) |
| `/reporting` | `GET /local-content` — the compliance dashboard's data source, always for the caller's own company (taken from the token; there is no `mineCompanyId` parameter) |

## 5. UI architecture

- **Routing**: Next.js App Router, one folder per route. Dynamic routes (`companies/[id]`, `rfqs/[id]`) fetch client-side on mount.
- **State**: no global store — `AuthProvider` (React Context) is the only cross-page state, holding the JWT and the decoded user. Everything else is local `useState` per page; there's no shared server-cache layer yet (no React Query/SWR). That's a deliberate MVP tradeoff — fine at this scale, worth adding once there are enough pages re-fetching the same data to matter.
- **Data flow**: page mounts → calls a typed function from `lib/api.ts` → renders loading skeleton → success or `ErrorBanner`. Every list view has a loading, empty, and error state — see `CompaniesPage` and `RfqsPage` for the pattern.
- **Component layering**:
  - **Layout**: `Navbar` (sticky, translucent, with a mobile menu and active-link state), `Footer`, `PageHeader` (eyebrow + serif title + lead + actions — the top of every page), `BrandMark`.
  - **Primitives**: `Button` / `ButtonLink`, `Badge`, `EmptyState`, `ErrorBanner`, `LoadingSkeleton` — no domain knowledge, reusable anywhere. Use `ButtonLink` for a link styled as a button; never put a `<Button>` inside a `<Link>` (invalid HTML, and it reads as two controls to screen readers).
  - **Domain display**: `CompanyCard`, `RfqCard`, `VerificationBadge`, `RfqStatusBadge`, `BidList`, `DocumentList` — know about the data shape, render-only.
  - **Domain forms**: `SearchFilters`, `BidForm`, `DocumentUploadForm` — own their local state and call the API client directly.
- **Visual language**: warm and quiet — an ivory page (`paper`), white hairline-bordered cards with soft shadows, a muted gold accent, and generous spacing. Headings use **Cormorant Garamond** (serif, with lining numerals so figures stay full height); everything else uses **DM Sans**. Both are loaded with `next/font`, so they're self-hosted at build time.
- **Design tokens** (`tailwind.config.ts`): `copper` is the gold accent (primary buttons, links, focus, "pending" states); `chrome` is a muted green for verified / success / local content; `sand` is the deeper cream for the footer and hero panels; `gray` is overridden with Tailwind's warm `stone` scale, so every neutral sits naturally on the ivory background. Colour carries the same meaning in every badge site-wide.
- **Shared classes** (`app/globals.css`): `page-title`, `page-lead`, `eyebrow` (small caps with a gold rule), `section-title`, `card-title`, `card`, `card-link`, `panel`, `label`, `input`, `hint`, `text-link`. Pages use these rather than repeating long class strings, which is what keeps the look consistent — change one, and every page follows.
- **Formatting**: amounts go through `formatMoney` ("$12,500") and dates through `formatDate` ("27 Oct 2026" — day first with a month name, so it can't be misread whatever the browser locale) in `lib/format.ts`.
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

- **Auth hardening**: JWT is still in `localStorage` (XSS-readable). Production should move to an httpOnly cookie + refresh-token pair. Route-level guards and ownership checks are now in place (see "Auth & authorization" below) — this remaining item is about the token's storage, not its enforcement.
- **Invite management is minimal**: admins can mint a one-time invite (`POST /companies/:id/invites`) but can't list pending ones, revoke one, or remove a user, and there's no way to hand over or add a second `COMPANY_ADMIN`. `PLATFORM_ADMIN` and `VERIFIER` accounts still have to be created by editing the database — there is no bootstrap path for them.
- **Review decisions are final and silent**: accepting or rejecting a bid and cancelling an RFQ can't be undone (the server enforces it — accepted bids are what the local-content dashboard totals), a closed RFQ can't be reopened, and nobody is told. A supplier can see what became of a bid on "My bids", but only by looking — nothing tells them. The push side is the notifications gap below; undo/reopen is a product decision about how much the dashboard numbers should be allowed to move.
- **A deadline doesn't close an RFQ**: bidding stops at the deadline and the RFQ drops off the public board, but its status stays `OPEN` until the mine closes, cancels or awards it. That's deliberate (no scheduler, and the status is the mine's call), but it means `status` alone never tells you whether an RFQ is biddable — read `biddingOpen`.
- **The nav doesn't know who you are**: every signed-in user sees "My bids", "My RFQs" and "Post an RFQ", because the JWT carries `companyId` and `role` but not whether the company is a mine or a supplier. Each page handles the wrong audience with an empty state, but adding `companyType` to the token claims would let the navbar show only what applies.
- **Redundant board special case**: `GET /rfqs` still returns a mine its own expired RFQs (flagged `biddingOpen: false`) from before "My RFQs" existed. It's harmless but no longer needed; removing it would let the board drop its optional-auth guard and the frontend's token-dependent refetch.
- **Type duplication**: `frontend/lib/types.ts` hand-mirrors `schema.prisma`. Fine at this size; once it drifts twice, generate the frontend types from the Prisma schema instead of hand-syncing.
- **File upload**: `DocumentUploadForm` takes a pasted link, not a real upload — presigned S3 upload is Phase 2.
- **No notifications**: RFQs don't yet fan out to matching suppliers (WhatsApp/SMS/email) — flagged in `RfqsService.create`.
- **Bids stay sealed forever**: there's no post-award disclosure — once an RFQ is awarded, other bidders still can't see who won or at what price. Public-procurement practice often publishes the award; whether this portal should is a product call, and `bids/bid-visibility.ts` is the one place to add it.
- **Ratings have no UI**: the endpoint is locked down, but no page lets a mine rate a supplier, and the company profile doesn't show ratings (the API returns them). Ratings are also final — there's no edit or delete, matching how accept/reject work.
- **A supplier can bid more than once on the same RFQ**: `BidsService.create` doesn't check for an existing live bid, and the schema has no unique `(rfqId, supplierCompanyId)`. With sealed bids that reads like "revise my quote", but the mine sees every copy and there's no edit or "replace my bid". Decide whether to block a second bid, or turn it into an explicit revision.
- **Self-declared categories**: verification is company-level, but a `VERIFIED` supplier can tick any category in the editor and immediately becomes eligible to bid on RFQs in it. Fine while verifiers review the company as a whole; revisit if category-specific evidence (e.g. safety certificates per category) matters.

## Auth & authorization

- `JwtStrategy` + `JwtAuthGuard` — any route with `@UseGuards(JwtAuthGuard)` requires a valid bearer token; `req.user` is the decoded `{ sub, email, companyId, role }` payload.
- `JwtOptionalAuthGuard` — decodes the token if present but never rejects; used on `GET /companies/:id` so the directory stays public while owners/verifiers get a fuller view.
- `RolesGuard` + `@Roles(...)` — restricts a route to specific `UserRole` values. Currently used to lock `PATCH /companies/:id/verification-status` and the document review endpoints to `VERIFIER`/`PLATFORM_ADMIN`.
- **Joining a company needs a one-time invite code** — `POST /auth/register` no longer takes a `companyId`; the company (and the role) come from the code, so knowing a company's public id gets you nothing.
  - Creating a company (`POST /companies`) mints the first code, role `COMPANY_ADMIN`, and returns it in that response. That's step 2 of onboarding: the creator registers with it and becomes the company's admin.
  - A company admin (or `PLATFORM_ADMIN`) mints further codes with `POST /companies/:id/invites` — role `COMPANY_MEMBER`, 7-day expiry, optionally locked to one email address. The frontend shows it as a `/register#invite=…` link on the company profile (fragment, not query string, so it stays out of server logs and `Referer`).
  - Codes are 192-bit random, stored only as a SHA-256 hash, single-use, and redeemed with a conditional update inside a transaction so two concurrent sign-ups can't both claim one. Every failure mode returns the same message so the endpoint can't be used to probe codes. A duplicate email is a 409 and doesn't burn the code.
- **Bids are only accepted while the RFQ is open** — `POST /bids` runs `RfqsService.assertOpenForBidding` before the eligibility check and returns 404 for an unknown RFQ, or 409 if its status isn't `OPEN` or its deadline has passed. An RFQ `deadline` is treated as a calendar date, not an instant: the new-RFQ form stores a date input as midnight UTC (02:00 in Harare) and the UI only ever shows the date, so bidding stays open through the end of that day in Zimbabwe (CAT, UTC+2) — see `rfqs/bidding-window.ts`. If RFQs ever get a time-of-day deadline, that file is the one place to change.
  - The same rule drives everything that asks "is this still biddable?": `GET /rfqs` drops RFQs past their window (the posting mine still gets its own back, flagged `biddingOpen: false`, because nothing else lists them), the dashboard's "Open RFQs" count, and the `biddingOpen` flag on every RFQ payload — which is what the frontend reads to show "Bidding closed" and hide the form, so the deadline logic isn't duplicated client-side.
  - A company also can't bid on its own RFQ (403) — otherwise a mine that is itself `VERIFIED` and lists the category could manufacture competing quotes on a request it also shortlists and awards.
- **Company ID is never trusted from the client on a write.** `POST /rfqs`, `POST /bids`, `POST /documents` and `POST /ratings` all derive the acting company from the verified JWT (`user.companyId`), not from the request body — see each controller for the same comment explaining why. The `GET /rfqs/mine` and `GET /bids/mine` listings work the same way: the company comes from the token, so there's no parameter that could point one at someone else's records.
- **Ownership checks, not just login checks**, on the three endpoints that update someone else's resource:
  - `PATCH /rfqs/:id/status` — only the mine that posted the RFQ (or a `PLATFORM_ADMIN`) can change its status, and only along `OPEN → CLOSED | CANCELLED` or `CLOSED → CANCELLED`. `AWARDED` is not settable here: it's reached only by accepting a bid, so an RFQ can't be marked awarded with nobody awarded. `AWARDED` and `CANCELLED` are final.
  - `PATCH /bids/:id/status` — split by transition: only the bidding supplier can set `WITHDRAWN`; every other transition (shortlist/accept/reject) is the RFQ-owning mine's call. Allowed moves are `SUBMITTED → SHORTLISTED | ACCEPTED | REJECTED | WITHDRAWN` and `SHORTLISTED → ACCEPTED | REJECTED | WITHDRAWN`; `ACCEPTED`, `REJECTED` and `WITHDRAWN` are final. Nothing but a withdrawal can happen on a `CANCELLED` RFQ.
  - **Accepting a bid awards its RFQ**, in one transaction (an `OPEN` or `CLOSED` RFQ becomes `AWARDED`). It's "an accepted bid", not "the accepted bid": a split award accepts several, and the RFQ simply stays `AWARDED`. Both status endpoints use conditional updates, so two reviewers acting at once get a 409 for the loser instead of silently overwriting each other, and both validate the body (400 for an unknown status).
  - The mine UI (`/rfqs/[id]` for the owner, plus `/rfqs/mine`) offers exactly these moves — close, cancel, shortlist, accept (confirmed), reject (confirmed) — and nothing else. `GET /rfqs/mine` lists every RFQ the caller's company has posted, in any status, because the board only shows biddable ones.
  - `POST /companies/:id/categories` and `PUT /companies/:id/categories` — only the company itself (or a `PLATFORM_ADMIN`) can edit its own category listing. Both validate the body and return 400 for an unknown category id rather than a foreign-key 500. The company profile has a category editor (suppliers only) that saves through the `PUT`.
  - `POST /categories` — `PLATFORM_ADMIN` only. It was unguarded despite its own comment saying so; anyone who could reach the API could add to the taxonomy suppliers pick from.
- **Ratings come only from a real, finished job.** `POST /ratings` used to be public and took the author company from the body, so anyone could rate any company, as any company, with any score. Now it requires sign-in, the author is the caller's company from the token (an `authorCompanyId` in the body is stripped), and a rating is accepted only when:
  - the caller's company posted the RFQ — not another mine, not the supplier, not a `PLATFORM_ADMIN`;
  - the RFQ is `AWARDED`, and the rated company has an `ACCEPTED` bid on it (a split award lets each accepted supplier be rated);
  - the score is a whole number 1–5 and any comment is at most 1000 characters;
  - this mine hasn't already rated this supplier for this RFQ — a database unique constraint on `(rfqId, authorCompanyId, ratedCompanyId)`, so concurrent requests can't slip past it.
  
  `GET /companies/:id` now returns only each rating's score, comment and date. Because a rating can only exist for an accepted bid, exposing its `rfqId` and author would reveal who won which RFQ — exactly what sealed bids keep private.
- **Bids are sealed.** The mine that posted an RFQ (or a `PLATFORM_ADMIN`) sees every bid on it; any other signed-in company sees only its own bids; anonymous visitors see none. Everyone sees the total count. One function, `bids/bid-visibility.ts`, defines this, and both endpoints that return bids on an RFQ go through it:
  - `GET /rfqs/:id` is still public, with the optional guard so the server knows who's asking. It always returns `_count.bids`, and `bids` per the rule above; an anonymous request never runs the bid query at all.
  - `GET /bids?rfqId=` now requires sign-in and a non-empty `rfqId` (400 otherwise). Before, it was public and — called with no `rfqId` — listed every bid on the platform.
  - The RFQ page shows non-owners a "N bids submitted · bids are sealed" summary plus their own bid(s), and the full reviewable list only to the owner. Because the stored token loads after the first render, the page fetches twice; only the latest response may update it, so a slow anonymous response can't replace the owner's view with the sealed one.
- **Document links are privacy-gated.** `GET /companies/:id` redacts `fileUrl` on every document unless the requester is the owning company or a verifier/admin — found and fixed in the previous pass; previously any anonymous visitor could read a company's raw tax-clearance/CR6 links.
- Verified with `npm install` + `tsc --noEmit` (backend and frontend) + full `next build` (frontend, all 10 routes) and a full manual trace of every guarded endpoint, including a grep sweep confirming service/controller signatures line up and no client-trusted company-id references remain. **Not yet verified with a live server run** — this sandbox can't download the Prisma query engine binary (`binaries.prisma.sh` isn't reachable here; confirmed there's no alternate legitimate source). Run this once locally to confirm at runtime:
  ```bash
  cd backend && npx prisma migrate dev --name init && npm run start:dev
  # in another terminal:
  curl -i http://localhost:3000/reporting/local-content              # expect 401 (no token)
  curl -i -X PATCH http://localhost:3000/companies/<id>/verification-status \
    -H "Authorization: Bearer <a COMPANY_MEMBER token>" -H "Content-Type: application/json" \
    -d '{"status":"VERIFIED"}'                                        # expect 403 (wrong role)
  curl -i -X PATCH http://localhost:3000/rfqs/<id>/status \
    -H "Authorization: Bearer <a token from a DIFFERENT mine>" -H "Content-Type: application/json" \
    -d '{"status":"CLOSED"}'                                          # expect 403 (not the owner)
  # and for the invite flow:
  curl -i -X POST http://localhost:3000/auth/register -H "Content-Type: application/json" \
    -d '{"inviteCode":"<a company id, or anything made up>","email":"x@y.test","password":"password123","fullName":"X"}'
                                                                       # expect 403 (invalid invite)
  ```
- **Run Prisma from `backend/`, never the repo root.** The root has no `package.json`, so `npx prisma` there skips the project's pinned Prisma 5.22 and downloads npm's `latest` (currently an 8.x pre-release) — whose CLI has no `migrate` command and fails with `No command registered for 'migrate'`. From `backend/`, `npx prisma --version` should report 5.22.0; `npm run prisma:migrate -- --name <name>` always uses the pinned version.
- **Schema change — run a migration.** This pass adds the `Invite` model: from `backend/`, `npx prisma migrate dev --name add-invites` (or `npx prisma db push` on a throwaway DB). Users registered before it are all `COMPANY_MEMBER`, so no company in an existing dev DB has an admin yet — promote one by hand (`UPDATE "User" SET role = 'COMPANY_ADMIN' WHERE email = '…';`) or re-register.
- **Second schema change: ratings are unique per (RFQ, author, rated company).** From `backend/`, `npx prisma migrate dev --name unique-ratings`. Ratings could be posted by anyone before, so a dev database may hold duplicates or ratings that don't match any accepted bid; the migration fails on duplicates. Look first with `SELECT "rfqId", "authorCompanyId", "ratedCompanyId", COUNT(*) FROM "Rating" GROUP BY 1, 2, 3 HAVING COUNT(*) > 1;` and clear anything that shouldn't be there before migrating.
- **Verified for the invite + category-editor pass**: backend and frontend `tsc --noEmit`, full `next build`, the invite redemption/authorization/category logic exercised against an in-memory Prisma fake (concurrent redemption, rollback on duplicate email, cross-company invite attempt, replace-set semantics), and the register → category editor → invite-link flow driven in a browser against a stub API. The real NestJS server against real Postgres is still unrun.

## Working conventions

- No direct pushes to `main` — all work happens on feature branches
- Database is not touched directly outside of Prisma migrations
- All changes go through review before merge
#   z w - m i n i n g - s u p p l y - p o r t a l  
 