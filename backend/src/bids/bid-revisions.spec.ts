import { withRevisionHistory } from './bid-revisions';

// One entry per offer: the rule every bid listing goes through.
describe('withRevisionHistory', () => {
  const b = (id: string, status: string, revisionOfId?: string) => ({ id, status, revisionOfId });

  it('passes bids that were never revised straight through, with empty history', () => {
    expect(withRevisionHistory([b('a', 'SUBMITTED'), b('c', 'REJECTED')])).toEqual([
      { ...b('a', 'SUBMITTED'), history: [] },
      { ...b('c', 'REJECTED'), history: [] },
    ]);
  });

  it('drops replaced versions from the top level and hangs them, newest first, under the current one', () => {
    const out = withRevisionHistory([b('v1', 'SUPERSEDED'), b('v2', 'SUPERSEDED', 'v1'), b('v3', 'SUBMITTED', 'v2')]);
    expect(out.map((x) => x.id)).toEqual(['v3']);
    expect(out[0].history.map((x) => x.id)).toEqual(['v2', 'v1']);
  });

  it('keeps separate offers separate, e.g. a withdrawn revised bid and a fresh bid after it', () => {
    const out = withRevisionHistory([
      b('a1', 'SUPERSEDED'),
      b('a2', 'WITHDRAWN', 'a1'),
      b('n1', 'SUPERSEDED'),
      b('n2', 'SHORTLISTED', 'n1'),
    ]);
    expect(out.map((x) => [x.id, x.history.map((h) => h.id)])).toEqual([
      ['a2', ['a1']],
      ['n2', ['n1']],
    ]);
  });

  it('keeps the order it was given', () => {
    const out = withRevisionHistory([b('z', 'SUBMITTED'), b('old', 'SUPERSEDED'), b('a', 'SUBMITTED', 'old')]);
    expect(out.map((x) => x.id)).toEqual(['z', 'a']);
  });

  it('stops at a version it was not given (e.g. outside the visible set)', () => {
    expect(withRevisionHistory([b('v2', 'SUBMITTED', 'missing')])[0].history).toEqual([]);
  });
});
