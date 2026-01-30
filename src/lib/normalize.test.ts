import { normalizeScore } from './normalize';

describe('normalizeScore', () => {
  it('normalizes imdb 0-10 to 0-100', () => {
    const res = normalizeScore({ source: 'imdb', label: 'IMDb', normalized: null, raw: { value: 7.6, scale: '0-10' } });
    expect(res.normalized).toBeCloseTo(76);
  });

  it('leaves missing raw as null', () => {
    const res = normalizeScore({ source: 'metacritic', label: 'MC', normalized: null, raw: { value: null, scale: '0-100' } });
    expect(res.normalized).toBeNull();
  });
});
