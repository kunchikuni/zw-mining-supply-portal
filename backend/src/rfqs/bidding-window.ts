// An RFQ's `deadline` is a calendar date, not an instant: the only client
// captures it from a date input (`<input type="date">`), which is stored as
// midnight UTC of that day — 02:00 in Harare — and the UI only ever displays
// the date. Comparing that raw instant to "now" would shut bidders out from
// 02:00 on the day the page tells them they can still bid.
//
// So bidding stays open through the end of the deadline's calendar day in
// Zimbabwe (CAT, UTC+2, no daylight saving).
const HARARE_UTC_OFFSET_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// First instant at which bids are no longer accepted: the Harare midnight
// that ends the deadline's calendar day.
export function biddingClosesAt(deadline: Date): Date {
  const harareLocal = deadline.getTime() + HARARE_UTC_OFFSET_MS;
  const dayStart = Math.floor(harareLocal / DAY_MS) * DAY_MS;
  return new Date(dayStart + DAY_MS - HARARE_UTC_OFFSET_MS);
}
