import { normalizeScore } from './normalize';

describe('normalizeScore', () => {
  it('normalizes imdb with boost for high scores', () => {
    // 7.6 IMDb → 70 + ((7.6-7)/2.3)*30 = 77.8 (boosted from 76)
    const res = normalizeScore({ source: 'imdb', label: 'IMDb', normalized: null, raw: { value: 7.6, scale: '0-10' } });
    expect(res.normalized).toBeCloseTo(78, 0);
  });

  it('boosts high imdb scores significantly', () => {
    // 8.6 IMDb → 70 + ((8.6-7)/2.3)*30 = 90.9 (boosted from 86)
    const res = normalizeScore({ source: 'imdb', label: 'IMDb', normalized: null, raw: { value: 8.6, scale: '0-10' } });
    expect(res.normalized).toBeCloseTo(91, 0);
  });

  it('leaves missing raw as null', () => {
    const res = normalizeScore({ source: 'metacritic', label: 'MC', normalized: null, raw: { value: null, scale: '0-100' } });
    expect(res.normalized).toBeNull();
  });
});
