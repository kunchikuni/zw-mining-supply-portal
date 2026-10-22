import { buildRfqAlert, escapeHtml } from './rfq-alert';

const rfq = {
  id: 'r1',
  title: 'Conveyor belt splicing',
  description: 'Hot vulcanised splicing of two 1200 mm belts during the planned shutdown.',
  quantity: '2 splices',
  province: 'Midlands',
  deadline: new Date('2026-10-24T00:00:00Z'),
  mine: { name: 'Demo Mine Ltd' },
  category: { name: 'Conveyor services' },
};
const recipient = { fullName: 'Tendai Moyo', company: { name: 'Demo Supplies (Pvt) Ltd' } };
const APP = 'https://portal.example';
const UNSUB = 'https://portal.example/unsubscribe?token=u1.sig';

describe('buildRfqAlert', () => {
  const email = buildRfqAlert(rfq, recipient, APP, UNSUB);

  it('names the category and title in the subject', () => {
    expect(email.subject).toBe('New RFQ in Conveyor services: Conveyor belt splicing');
  });

  it('links to the RFQ and to the no-sign-in unsubscribe page, in both parts', () => {
    expect(email.text).toContain('https://portal.example/rfqs/r1');
    expect(email.text).toContain('Turn off RFQ alerts: https://portal.example/unsubscribe?token=u1.sig');
    expect(email.html).toContain('https://portal.example/rfqs/r1');
    expect(email.html).toContain('href="https://portal.example/unsubscribe?token=u1.sig"');
  });

  it("gives the details a supplier needs, with the deadline as the mine's calendar date", () => {
    expect(email.text).toContain('Posted by: Demo Mine Ltd');
    expect(email.text).toContain('Quantity: 2 splices');
    expect(email.text).toContain('Province: Midlands');
    expect(email.text).toContain('Bids close: 24 Oct 2026, end of day (Harare time)');
    expect(email.text).toContain('Hi Tendai Moyo,');
  });

  it('says why the recipient got it', () => {
    expect(email.text).toContain('Demo Supplies (Pvt) Ltd is a verified supplier in Conveyor services');
  });

  it('leaves out quantity and province when the RFQ has none', () => {
    const bare = buildRfqAlert({ ...rfq, quantity: null, province: undefined }, recipient, APP, UNSUB);
    expect(bare.text).not.toMatch(/Quantity|Province/);
  });

  it('shortens a long description at a word boundary', () => {
    const long = buildRfqAlert({ ...rfq, description: 'word '.repeat(200) }, recipient, APP, UNSUB);
    const line = long.text.split('\n').find((l) => l.startsWith('word'))!;
    expect(line.length).toBeLessThanOrEqual(401);
    expect(line.endsWith('word…')).toBe(true);
  });

  it('escapes everything users typed in the HTML part, and leaves the text part readable', () => {
    const evil = buildRfqAlert(
      { ...rfq, title: '<img src=x onerror=alert(1)>', mine: { name: 'A & B "Mining"' } },
      { fullName: "O'Brien <b>", company: { name: 'X' } },
      APP,
      UNSUB,
    );
    expect(evil.html).not.toContain('<img');
    expect(evil.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(evil.html).toContain('A &amp; B &quot;Mining&quot;');
    expect(evil.html).toContain('O&#39;Brien &lt;b&gt;');
    expect(evil.text).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});
