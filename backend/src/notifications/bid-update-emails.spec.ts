import { buildBidDecisionEmail, buildRfqCancelledEmail, formatAmount } from './bid-update-emails';

const rfq = {
  id: 'r1',
  title: 'Hard hats & <gloves>',
  deadline: new Date('2026-11-30T00:00:00Z'),
  mine: { name: "Mine O'Neil" },
  category: { name: 'PPE' },
};
const bid = { amount: '12345.5', currency: 'USD', leadTimeDays: 14 };
const ann = { fullName: 'Ann', company: { name: 'Sup & Co' } };
const APP = 'https://portal.example';

describe('formatAmount', () => {
  it('shows the currency and two decimals with thousands separators', () => {
    expect(formatAmount(bid)).toBe('USD 12,345.50');
    expect(formatAmount({ amount: 7, currency: 'ZWG' })).toBe('ZWG 7.00');
  });
});

describe('buildBidDecisionEmail', () => {
  it.each([
    ['SHORTLISTED', 'Your bid was shortlisted: Hard hats & <gloves>', 'Shortlisted'],
    ['ACCEPTED', 'Your bid was accepted: Hard hats & <gloves>', 'Accepted'],
    ['REJECTED', 'Your bid was not selected: Hard hats & <gloves>', 'Not selected'],
  ] as const)('%s: says what happened in the subject and the details', (decision, subject, status) => {
    const email = buildBidDecisionEmail(decision, rfq, bid, ann, APP);
    expect(email.subject).toBe(subject);
    expect(email.text).toContain(`Status: ${status}`);
    expect(email.text).toContain('Your bid: USD 12,345.50');
    expect(email.text).toContain('Lead time: 14 days');
  });

  it('only shortlisting says no decision has been made yet', () => {
    expect(buildBidDecisionEmail('SHORTLISTED', rfq, bid, ann, APP).text).toContain('No final decision has been made yet.');
    expect(buildBidDecisionEmail('ACCEPTED', rfq, bid, ann, APP).text).not.toContain('No final decision');
  });

  it('links to the RFQ and to My bids, in both parts', () => {
    const email = buildBidDecisionEmail('ACCEPTED', rfq, bid, ann, APP);
    for (const part of [email.text, email.html]) {
      expect(part).toContain('https://portal.example/rfqs/r1');
      expect(part).toContain('https://portal.example/bids/mine');
    }
  });

  it('leaves out the lead time when the bid has none', () => {
    expect(buildBidDecisionEmail('REJECTED', rfq, { ...bid, leadTimeDays: null }, ann, APP).text).not.toContain('Lead time');
  });

  it('escapes what users typed in the HTML part, and leaves the text part readable', () => {
    const email = buildBidDecisionEmail('ACCEPTED', rfq, bid, ann, APP);
    expect(email.html).toContain('Hard hats &amp; &lt;gloves&gt;');
    expect(email.html).toContain('Mine O&#39;Neil');
    expect(email.html).not.toContain('<gloves>');
    expect(email.text).toContain("Mine O'Neil has accepted your bid");
  });
});

describe('buildRfqCancelledEmail', () => {
  it('says the RFQ was cancelled and the bid will not be considered', () => {
    const email = buildRfqCancelledEmail(rfq, bid, ann, APP);
    expect(email.subject).toBe('RFQ cancelled: Hard hats & <gloves>');
    expect(email.text).toContain("Mine O'Neil has cancelled this request for quote, so your bid won't be considered.");
    expect(email.text).toContain('Your bid: USD 12,345.50');
    expect(email.text).toContain('Was due to close: 30 Nov 2026');
    expect(email.text).toContain("You're receiving this because Sup & Co bid on this RFQ");
  });
});
