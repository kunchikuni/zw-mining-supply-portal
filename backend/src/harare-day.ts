// Some dates in this app are calendar days, not instants: an RFQ's bid
// deadline and a document's expiry date both come from a date input
// (`<input type="date">`), are stored as midnight UTC of that day — 02:00 in
// Harare — and are only ever shown as a date. They mean "through the end of
// that day in Zimbabwe" (CAT, UTC+2, no daylight saving), so they're compared
// against these day boundaries rather than as raw instants.
const HARARE_UTC_OFFSET_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// The Harare midnight that starts `date`'s calendar day.
export function startOfHarareDay(date: Date): Date {
  const harareLocal = date.getTime() + HARARE_UTC_OFFSET_MS;
  return new Date(Math.floor(harareLocal / DAY_MS) * DAY_MS - HARARE_UTC_OFFSET_MS);
}

// The calendar day it is in Harare at `date`, as midnight UTC: the form a
// stored calendar date (deadline, expiry) takes, so the two compare directly.
export function harareCalendarDay(date: Date): Date {
  return new Date(startOfHarareDay(date).getTime() + HARARE_UTC_OFFSET_MS);
}

// The Harare midnight that ends it: the first instant of the next day.
export function endOfHarareDay(date: Date): Date {
  return new Date(startOfHarareDay(date).getTime() + DAY_MS);
}
