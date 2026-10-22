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
│       ├── ratings/             # post-job performance scores
│       ├── notifications/       # email outbox + sender, new-RFQ alerts
│       └── staff/               # platform admins manage portal staff accounts
└── frontend/
    ├── app/
    │   ├── layout.tsx           # AuthProvider + Navbar wrapper
    │   ├── page.tsx             # home
    │   ├── login/page.tsx
    │   ├── account/page.tsx     # your account: email preferences, link to change password
    │   ├── account/password/    # change your password (also first sign-in on a temporary one)
    │   ├── staff/page.tsx       # platform admins: add, disable, reset staff
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
| `/auth` | `POST /register` (needs an `inviteCode`), `POST /login` (refuses a disabled account; says if the password is temporary), `POST /change-password` (signed in; needs the current password; signs out other sessions), `GET /me` and `PATCH /me` (the caller's own account; only `rfqAlerts` is settable) |
| `/staff` | Platform admins only: `GET /`, `POST /` (returns a one-time temporary password), `PATCH /:id/disabled`, `POST /:id/reset-password` — never your own account |
| `/companies` | `POST /` (returns the first-admin `inviteCode`), `GET /` (search/filter), `GET /:id`, `POST /:id/categories` (add), `PUT /:id/categories` (replace the whole listing), `POST /:id/invites` (company admin), `GET /verification-queue` (verifiers: companies in PENDING with a document summary and `lapsedDocTypes`), `PATCH /:id/verification-status` (verifiers; `VERIFIED` needs a current approved document and nothing lapsed without an approved renewal) |
| `/categories` | `GET /`, `POST /` (platform admin only) |
| `/documents` | `POST /` (also moves an unverified/rejected company to PENDING; `expiresAt` required for tax clearance, NSSA and PRAZ, refused on a company registration or if already past), `GET /?companyId=`, `GET /review-queue` (verifiers), `PATCH /:id/review` (verifiers; once per document; rejecting needs a `reviewNote`; approving confirms `expiresAt`) |
| `/rfqs` | `POST /` (mining companies only; anyone else gets 403), `GET /` (still-biddable, filterable; optional auth also returns the caller's own expired RFQs), `GET /mine` (all of the caller's RFQs, any status), `GET /:id` (bids sealed: everyone gets the count, only the posting mine gets every bid, a bidder gets its own; on an awarded RFQ the posting mine also gets the `ratings` it gave), `PATCH /:id/status` (owner: close or cancel) |
| `/bids` | `POST /` (a `VERIFIED` supplier listed under the RFQ's category — mines and staff get 403; while the caller's bid on that RFQ is still live, the new one replaces it as a revision), `GET /?rfqId=` (sign-in and `rfqId` required; same sealed rule), `GET /mine` (the caller's bids across every RFQ, each with its RFQ), `PATCH /:id/status` (owner: shortlist/accept/reject; bidder: withdraw — accept also awards the RFQ) |
| `/ratings` | `POST /` (sign-in; the posting mine rates a supplier it accepted on an awarded RFQ, once), `GET /company/:id/average` (public aggregate) |
| `/reporting` | `GET /local-content` — the compliance dashboard's data source, always for the caller's own company (taken from the token; there is no `mineCompanyId` parameter) |

## 5. UI architecture

- **Routing**: Next.js App Router, one folder per route. Dynamic routes (`companies/[id]`, `rfqs/[id]`) fetch client-side on mount.
- **State**: no global store — `AuthProvider` (React Context) is the only cross-page state, holding the JWT and the decoded user. Everything else is local `useState` per page; there's no shared server-cache layer yet (no React Query/SWR). That's a deliberate MVP tradeoff — fine at this scale, worth adding once there are enough pages re-fetching the same data to matter.
- **Data flow**: page mounts → calls a typed function from `lib/api.ts` → renders loading skeleton → success or `ErrorBanner`. Every list view has a loading, empty, and error state — see `CompaniesPage` and `RfqsPage` for the pattern.
- **Component layering**:
  - **Layout**: `Navbar` (sticky, translucent, with a mobile menu and active-link state), `Footer`, `PageHeader` (eyebrow + serif title + lead + actions — the top of every page), `BrandMark`.
  - **Primitives**: `Button` / `ButtonLink`, `Badge`, `EmptyState`, `ErrorBanner`, `LoadingSkeleton` — no domain knowledge, reusable anywhere. Use `ButtonLink` for a link styled as a button; never put a `<Button>` inside a `<Link>` (invalid HTML, and it reads as two controls to screen readers).
  - **Domain display**: `CompanyCard`, `RfqCard`, `VerificationBadge`, `RfqStatusBadge`, `BidList`, `BidHistory`, `DocumentList`, `ExpiryNotice`, `RatingStars`, `CompanyRatings`, `SupplierRatingsPanel` — know about the data shape, render-only.
  - **Domain forms**: `SearchFilters`, `BidForm`, `DocumentUploadForm`, `RatingForm` — own their local state and call the API client directly.
- **Visual language**: warm and quiet — an ivory page (`paper`), white hairline-bordered cards with soft shadows, a muted gold accent, and generous spacing. Headings use **Cormorant Garamond** (serif, with lining numerals so figures stay full height); everything else uses **DM Sans**. Both are loaded with `next/font`, so they're self-hosted at build time.
- **Design tokens** (`tailwind.config.ts`): `copper` is the gold accent (primary buttons, links, focus, "pending" states); `chrome` is a muted green for verified / success / local content; `sand` is the deeper cream for the footer and hero panels; `gray` is overridden with Tailwind's warm `stone` scale, so every neutral sits naturally on the ivory background. Colour carries the same meaning in every badge site-wide.
- **Shared classes** (`app/globals.css`): `page-title`, `page-lead`, `eyebrow` (small caps with a gold rule), `section-title`, `card-title`, `card`, `card-link`, `panel`, `label`, `input`, `hint`, `text-link`. Pages use these rather than repeating long class strings, which is what keeps the look consistent — change one, and every page follows.
- **Formatting**: amounts go through `formatMoney` ("$12,500") and dates through `formatDate` ("27 Oct 2026" — day first with a month name, so it can't be misread whatever the browser locale) in `lib/format.ts`.
- **Accessibility**: every form input has an associated `<label>`; buttons carry `aria-busy` while loading; focus-visible outline is set globally in `globals.css`.

## 6. Getting started

```bash
# Backend
cd backend
cp .env.example .env       # set DATABASE_URL and JWT_SECRET; SMTP_* for email (see below)
npm install
npx prisma migrate dev --name init
npm run seed
npm run create:staff -- --email you@example.com --name "Your Name" --role PLATFORM_ADMIN   # first admin (prints a temporary password); add other staff on the Staff page
npm run start:dev          # http://localhost:3000

# Frontend (separate terminal)
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                # http://localhost:3001 (or whatever port is free)

# Email, locally: Mailpit catches everything the app sends (nothing reaches a real inbox)
docker run -d --name zwsp-mailpit -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit
# then in backend/.env: SMTP_HOST=127.0.0.1, SMTP_PORT=1025 — and read mail at http://localhost:8025
```

## Known gaps / next honest steps

- **Auth hardening**: JWT is still in `localStorage` (XSS-readable). Production should move to an httpOnly cookie + refresh-token pair. Route-level guards and ownership checks are in place, and the account behind a token is re-checked on every request (see "Auth & authorization" below) — this remaining item is about the token's storage, not its enforcement. There's also no rate limiting on sign-in.
- **Invite management is minimal**: admins can mint a one-time invite (`POST /companies/:id/invites`) but can't list pending ones, revoke one, or remove a user, and there's no way to hand over or add a second `COMPANY_ADMIN`. Staff accounts are managed on the Staff page, but a staff member's role can't be changed there, and company users can't be disabled — the mechanism (`User.disabledAt`) exists, only staff are reachable.
- **Verification decisions are one-way in the UI**: a reviewed document can't be re-reviewed (by design), and the workspace offers verify/reject only for companies in `PENDING` — revoking an already-verified company means calling `PATCH /companies/:id/verification-status` directly. There's no audit history beyond `reviewedBy` / `reviewNote` on each document, and nobody is notified of a decision.
- **Expiry warnings are on-screen only**: a company sees "expires in N days" on its own profile from 30 days out, but nobody is emailed — reminders belong with notifications. The expiry sweep runs inside the API process (at startup and at the top of every hour); with several instances each runs it, which is harmless because every write is conditional, but a single scheduled job would be tidier at scale.
- **Review decisions are final**: accepting or rejecting a bid and cancelling an RFQ can't be undone (the server enforces it — accepted bids are what the local-content dashboard totals), and a closed RFQ can't be reopened. Undo/reopen is a product decision about how much the dashboard numbers should be allowed to move. Each of these moves is now emailed to the other side (see bid emails below).
- **A deadline doesn't close an RFQ**: bidding stops at the deadline and the RFQ drops off the public board, but its status stays `OPEN` until the mine closes, cancels or awards it. That's deliberate (no scheduler, and the status is the mine's call), but it means `status` alone never tells you whether an RFQ is biddable — read `biddingOpen`.
- **The nav learns who you are after sign-in**: the JWT carries `companyId` and `role` but not whether the company is a mine or a supplier, so the frontend loads the company type from `GET /auth/me` once per sign-in (`useAuth().companyType`). Mines get Dashboard, My RFQs and "Post an RFQ"; suppliers get My bids and the bid form. While the type loads (and if `/auth/me` fails), a signed-in user sees only the public links. Adding `companyType` to the token claims would remove that request, at the cost of old tokens lacking it until they expire.
- **RFQs posted by suppliers before posting became mines-only** stay as they are. Their company can still find them on `/rfqs/mine` (by URL; the nav link is mines-only) and close or cancel them.
- **Redundant board special case**: `GET /rfqs` still returns a mine its own expired RFQs (flagged `biddingOpen: false`) from before "My RFQs" existed. It's harmless but no longer needed; removing it would let the board drop its optional-auth guard and the frontend's token-dependent refetch.
- **Type duplication**: `frontend/lib/types.ts` hand-mirrors `schema.prisma`. Fine at this size; once it drifts twice, generate the frontend types from the Prisma schema instead of hand-syncing.
- **File upload**: `DocumentUploadForm` takes a pasted link, not a real upload — presigned S3 upload is Phase 2.
- **Notifications are email only, for new RFQs and bid outcomes**: verification decisions and expiry reminders aren't emailed yet, and there's no WhatsApp/SMS. Alerts link to the Account page to opt out, which needs sign-in; before sending in volume, add a one-click `List-Unsubscribe` link (large mailbox providers expect it from bulk senders). Emails that end `FAILED` (after 6 attempts) are only visible in the `EmailOutbox` table — there's no admin view or alert for them.
- **Bids stay sealed forever**: there's no post-award disclosure — once an RFQ is awarded, other bidders still can't see who won or at what price. Public-procurement practice often publishes the award; whether this portal should is a product call, and `bids/bid-visibility.ts` is the one place to add it.
- **Ratings are final, and only on the profile**: a mine rates each supplier it hired from the awarded RFQ's page, and the supplier's profile shows the average and every comment — but a rating can't be edited or deleted (matching how accept/reject work), the directory cards and a mine's bid list don't show a bidder's rating yet, and "My RFQs" doesn't flag awarded RFQs still waiting for one.
- **One live bid per supplier is enforced in code, not by the database**: `BidsService.create` locks the RFQ row while it revises or creates a bid, which is what stops two submissions racing. A partial unique index on `(rfqId, supplierCompanyId)` for `SUBMITTED`/`SHORTLISTED` bids would make the database guarantee it too; it needs a hand-written migration, and existing duplicate bids from before revisions would have to be cleared first. Also by design for now: a supplier whose bid was rejected or withdrawn can submit a fresh one while bidding is open, and revisions have no limit before the deadline.
- **Self-declared categories**: verification is company-level, but a `VERIFIED` supplier can tick any category in the editor and immediately becomes eligible to bid on RFQs in it. Fine while verifiers review the company as a whole; revisit if category-specific evidence (e.g. safety certificates per category) matters.

## Auth & authorization

- `JwtStrategy` + `JwtAuthGuard` — any route with `@UseGuards(JwtAuthGuard)` requires a valid bearer token, and `JwtStrategy` re-reads the account on every request: a disabled account, or a token issued before the account's last password change or reset (`User.tokensValidAfter`), is refused (401), and `req.user`'s `{ sub, email, companyId, role }` comes from the database, so a role change applies at once. The frontend signs out whenever the API refuses its token.
- `JwtOptionalAuthGuard` — decodes the token if present but never rejects; used on `GET /companies/:id` so the directory stays public while owners/verifiers get a fuller view.
- `RolesGuard` + `@Roles(...)` — restricts a route to specific `UserRole` values. Used to lock verification (`PATCH /companies/:id/verification-status`, `GET /companies/verification-queue`) and document review (`GET /documents/review-queue`, `PATCH /documents/:id/review`) to `VERIFIER`/`PLATFORM_ADMIN`, and `POST /categories` to `PLATFORM_ADMIN`.
- **Verification is done by portal staff, in the app.** Staff (`VERIFIER` / `PLATFORM_ADMIN`) are created with `npm run create:staff -- --email … --name … [--role PLATFORM_ADMIN] [--password-file <path>]` and belong to the portal's own company of type `PLATFORM` — a type that can't be chosen at signup (400), never appears in the directory, and can't be used as a directory filter. Signing in takes staff to `/verify`, and their nav shows Verification instead of the mine/supplier links.
  - **Platform admins manage staff on the Staff page** (`/staff`, `GET/POST/PATCH /staff`): add a verifier or admin (a temporary password is shown once), disable or re-enable an account (it's signed out on its next request and can't sign in), and reset a password (a new temporary one; existing sessions end). An admin can't disable or reset their own account — which also means the last active admin can never be locked out. Only accounts in the `PLATFORM` company are reachable (404 otherwise). The first admin comes from `npm run create:staff -- --role PLATFORM_ADMIN`.
  - **New RFQs are emailed to the suppliers who can bid on them.** Posting an RFQ queues one email per active user (who hasn't turned alerts off on their Account page) at every `VERIFIED` supplier listing the RFQ's category — the same eligibility bids are held to — except the posting mine. The emails are written to an `EmailOutbox` table **in the same transaction as the RFQ**, keyed by RFQ and user so nothing is queued twice, and `EmailOutboxService` delivers them over SMTP every 15 seconds: each email is claimed with a conditional update (so two instances never send the same one), failures are retried after 1 min, 5 min, 30 min, 2 h and 6 h, and the sixth failure marks it `FAILED` with the error. An alert that's still waiting when bidding closes is `SKIPPED`. Without `SMTP_HOST`, emails wait in the outbox. Everything a user typed is HTML-escaped in the email.
  - **Suppliers are emailed what happens to their bids** (`BidUpdatesService`): when the mine shortlists, accepts or turns down a bid ("Your bid was not selected"), and when it cancels an RFQ, or closes it before its deadline ("Bidding closed early": the bid stands but can't be revised), while the bid is still in play (`SUBMITTED` or `SHORTLISTED`). Closing after the deadline sends nothing, since bidding had already stopped. The other way round, **the mine is emailed when a supplier withdraws a bid**. The email goes to every active user at the supplier, since a bid doesn't record who submitted it, whatever their RFQ-alert setting, because it's about their own bid. It shows the RFQ, the amount and lead time, and links to the RFQ and My bids. Like the alerts, it's queued in the same transaction as the decision, so a decision whose email can't be queued is rolled back, and it's keyed by decision, bid and user. All portal emails share one layout (`notifications/email-layout.ts`).
  - **Everyone can change their own password** (`/account/password`, `POST /auth/change-password`): it needs the current password, signs out every other session and keeps this one. Anyone on a temporary password (new staff, a reset, or `create:staff`) is sent there after signing in.
  - Submitting a document moves an `UNVERIFIED` or `REJECTED` company to `PENDING` (a `VERIFIED` company stays verified), which is what puts it in the verifier's queue.
  - A document is reviewed **once** (`PENDING → APPROVED | REJECTED`, conditional update, so a second reviewer gets 409); rejecting requires a reason, which the company sees on its profile next to a "View document" link.
  - **Documents expire.** Tax clearance, NSSA compliance and PRAZ registration must be uploaded with their expiry date (400 without); a company registration never takes one; any other document may. A date is a calendar day, valid through the end of that day in Harare (`harare-day.ts`, shared with the bid deadline). A document can't be uploaded or approved once lapsed (400). Approving confirms the date: the verifier's field is pre-filled with the company's date, and whatever it holds on approval is what's stored.
  - `DocumentExpiryService` runs at startup and at the top of every hour (each expiry ends at Harare midnight, which is on the hour). It marks lapsed `APPROVED` and `PENDING` documents `EXPIRED`, and a `VERIFIED` company that no longer has a current approval for every document type it had approved drops to `PENDING` if a renewal is waiting for review, or `UNVERIFIED` until it uploads one — so it can't bid. A renewal approved before the old document lapses keeps the company verified. The company sees why on its profile; a pending document that lapses leaves the review queue at once.
  - A company can't be marked `VERIFIED` without at least one current `APPROVED` document, nor while a type it had approved has lapsed without an approved renewal (409, naming the document); rejecting, or resetting to `PENDING` / `UNVERIFIED`, is always allowed.
- **Joining a company needs a one-time invite code** — `POST /auth/register` no longer takes a `companyId`; the company (and the role) come from the code, so knowing a company's public id gets you nothing.
  - Creating a company (`POST /companies`) mints the first code, role `COMPANY_ADMIN`, and returns it in that response. That's step 2 of onboarding: the creator registers with it and becomes the company's admin.
  - A company admin (or `PLATFORM_ADMIN`) mints further codes with `POST /companies/:id/invites` — role `COMPANY_MEMBER`, 7-day expiry, optionally locked to one email address. The frontend shows it as a `/register#invite=…` link on the company profile (fragment, not query string, so it stays out of server logs and `Referer`).
  - Codes are 192-bit random, stored only as a SHA-256 hash, single-use, and redeemed with a conditional update inside a transaction so two concurrent sign-ups can't both claim one. Every failure mode returns the same message so the endpoint can't be used to probe codes. A duplicate email is a 409 and doesn't burn the code.
- **Bids are only accepted while the RFQ is open** — `POST /bids` runs `RfqsService.assertOpenForBidding` before the eligibility check and returns 404 for an unknown RFQ, or 409 if its status isn't `OPEN` or its deadline has passed. An RFQ `deadline` is treated as a calendar date, not an instant: the new-RFQ form stores a date input as midnight UTC (02:00 in Harare) and the UI only ever shows the date, so bidding stays open through the end of that day in Zimbabwe (CAT, UTC+2) — see `rfqs/bidding-window.ts`. If RFQs ever get a time-of-day deadline, that file is the one place to change.
  - The same rule drives everything that asks "is this still biddable?": `GET /rfqs` drops RFQs past their window (the posting mine still gets its own back, flagged `biddingOpen: false`, because nothing else lists them), the dashboard's "Open RFQs" count, and the `biddingOpen` flag on every RFQ payload — which is what the frontend reads to show "Bidding closed" and hide the form, so the deadline logic isn't duplicated client-side.
  - **A second bid is a revision.** A supplier has at most one live (`SUBMITTED` or `SHORTLISTED`) bid per RFQ: bidding again while one is live replaces it. The old bid becomes `SUPERSEDED` and is kept; the new one starts `SUBMITTED` (so a shortlisted bid that's revised goes back to the mine to review) and points back through `revisionOfId`, which is unique, so each offer's versions form one chain. `BidsService.create` locks the RFQ row (`SELECT … FOR UPDATE`) and re-checks that bidding is open before doing this, so two submissions can't both create a live bid, and a bid accepted a moment earlier stays accepted (409). After a withdrawal or rejection there's no live bid, so a new bid is just a new bid.
  - Every bid listing (`GET /rfqs/:id`, `GET /bids?rfqId=`, `GET /bids/mine`) shows one entry per offer, its current version, with the versions it replaced under `history` (`bids/bid-revisions.ts`), and the public bid count counts offers, not versions. `SUPERSEDED` can't be set through `PATCH /bids/:id/status` (400). In the UI, the bid form becomes "Revise your bid" (pre-filled) while the supplier's bid is live, and the mine sees "Revised once · was $X" with the full history.
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
  
  The posting mine rates from its awarded RFQ's page ("Rate your supplier", one form per accepted supplier, gone once rated). For that, `GET /rfqs/:id` returns the `ratings` the mine gave on the RFQ — only to whoever sees every bid (`seesEveryBid` in `bids/bid-visibility.ts`), since a rating says who won.
  
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
- **Sixth schema change: the email outbox** — an `EmailOutbox` table with an `EmailStatus` enum, and `User.rfqAlerts` (default `true`). Additive. From `backend/`, `npx prisma migrate dev --name email-outbox`.
- **Fifth schema change: account controls** — `User.disabledAt`, `User.tokensValidAfter` (both nullable) and `User.mustChangePassword` (default `false`). Additive. From `backend/`, `npx prisma migrate dev --name account-controls`.
- **Fourth schema change: bid revisions** — a `SUPERSEDED` value on `BidStatus` and a nullable, unique `Bid.revisionOfId`. From `backend/`, `npx prisma migrate dev --name bid-revisions`. Nothing to backfill: existing bids simply have no history.
- **Third schema change: a `PLATFORM` company type** for portal staff. It only adds an enum value: `npx prisma migrate dev --name platform-company-type` from `backend/`.
- **Second schema change: ratings are unique per (RFQ, author, rated company).** From `backend/`, `npx prisma migrate dev --name unique-ratings`. Ratings could be posted by anyone before, so a dev database may hold duplicates or ratings that don't match any accepted bid; the migration fails on duplicates. Look first with `SELECT "rfqId", "authorCompanyId", "ratedCompanyId", COUNT(*) FROM "Rating" GROUP BY 1, 2, 3 HAVING COUNT(*) > 1;` and clear anything that shouldn't be there before migrating.
- **Verified for the invite + category-editor pass**: backend and frontend `tsc --noEmit`, full `next build`, the invite redemption/authorization/category logic exercised against an in-memory Prisma fake (concurrent redemption, rollback on duplicate email, cross-company invite attempt, replace-set semantics), and the register → category editor → invite-link flow driven in a browser against a stub API. The real NestJS server against real Postgres is still unrun.

## Working conventions

- No direct pushes to `main` — all work happens on feature branches
- Database is not touched directly outside of Prisma migrations
- All changes go through review before merge
# zw-mining-supply-portal
