import { buildDocumentReviewedEmail, buildVerificationEmail } from './company-update-emails';

const APP = 'https://portal.example';
const ann = { fullName: 'Ann' };
const sup = { id: 'sup1', name: 'Sup & <Co>', type: 'SUPPLIER' as const };
const mine = { id: 'mine1', name: "Mine O'Neil", type: 'MINE' as const };

describe('company emails', () => {
  it('link to the company profile and the Account page, in both parts', () => {
    const email = buildVerificationEmail('VERIFIED', 'VERIFIED', sup, ann, APP);
    for (const part of [email.text, email.html]) {
      expect(part).toContain('https://portal.example/companies/sup1');
      expect(part).toContain('https://portal.example/account');
    }
  });

  it('escape what users typed in the HTML part, and leave the text part readable', () => {
    const email = buildDocumentReviewedEmail(false, { name: 'tax clearance', expiresAt: null }, '<b>Blurry</b> & cut off', sup, ann, APP);
    expect(email.html).toContain('Sup &amp; &lt;Co&gt;');
    expect(email.html).toContain('&lt;b&gt;Blurry&lt;/b&gt; &amp; cut off');
    expect(email.html).not.toContain('<b>Blurry');
    expect(email.text).toContain('Reason: <b>Blurry</b> & cut off');
  });

  it('tell a verified supplier it can bid now, and a mine what verification means for it', () => {
    expect(buildVerificationEmail('VERIFIED', 'VERIFIED', sup, ann, APP).text).toContain('You can now bid on requests for quote');
    const forMine = buildVerificationEmail('VERIFIED', 'VERIFIED', mine, ann, APP).text;
    expect(forMine).toContain('shows as verified in the directory');
    expect(forMine).not.toContain('bid');
  });

  it("only tell a supplier it can't bid once verification is gone", () => {
    expect(buildVerificationEmail('NO_LONGER_VERIFIED', 'PENDING', sup, ann, APP).text).toContain("can't bid");
    expect(buildVerificationEmail('NO_LONGER_VERIFIED', 'PENDING', mine, ann, APP).text).not.toContain("can't bid");
  });

  it('point a declined company at its document notes', () => {
    const email = buildVerificationEmail('DECLINED', 'REJECTED', sup, ann, APP);
    expect(email.text).toContain('Status: Declined');
    expect(email.text).toContain('Check the notes on your documents');
  });

  it("say an approved document that never expires doesn't", () => {
    expect(buildDocumentReviewedEmail(true, { name: 'company registration', expiresAt: null }, null, sup, ann, APP).text).toContain(
      "Valid until: Doesn't expire",
    );
  });
});
