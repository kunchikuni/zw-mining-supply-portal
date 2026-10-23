-- A supplier has at most one live (SUBMITTED or SHORTLISTED) bid per RFQ:
-- bidding again revises it (BidsService.create). The code enforces that while
-- holding a lock on the RFQ row; this makes the database guarantee it too.

-- Duplicate live bids from before revisions existed would block the index.
-- Which one stands is for the mine and the supplier to settle, so stop here,
-- before changing anything, and say how to find them.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Bid" WHERE "status" IN ('SUBMITTED', 'SHORTLISTED')
    GROUP BY "rfqId", "supplierCompanyId" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Some suppliers have more than one live bid on the same RFQ. Leave one live bid per supplier per RFQ (withdraw the others), then run this migration again. To list them: SELECT "rfqId", "supplierCompanyId", count(*) FROM "Bid" WHERE status IN (''SUBMITTED'', ''SHORTLISTED'') GROUP BY 1, 2 HAVING count(*) > 1;';
  END IF;
END $$;

-- Partial, so any number of superseded, withdrawn, rejected or accepted bids
-- can sit beside the live one. Keep the statuses in step with
-- LIVE_BID_STATUSES (src/bids/bid-revisions.ts). schema.prisma can't express
-- a partial index; Prisma Migrate leaves it alone.
CREATE UNIQUE INDEX "Bid_one_live_per_supplier_key" ON "Bid" ("rfqId", "supplierCompanyId") WHERE "status" IN ('SUBMITTED', 'SHORTLISTED');
