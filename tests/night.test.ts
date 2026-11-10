import { describe, expect, it } from 'vitest';
import { nightAmount } from '../src/render/night';

describe('nightAmount', () => {
  it('é dia de manhã e noite fechada à noite', () => {
    expect(nightAmount(0)).toBe(0);
    expect(nightAmount(600 * 0.3)).toBe(0);
    expect(nightAmount(600 * 0.8)).toBe(1);
  });
  it('repete a cada dia e fica entre 0 e 1', () => {
    expect(nightAmount(600 * 5 + 480)).toBeCloseTo(nightAmount(480), 10);
    for (let t = 0; t < 600; t += 7) { const n = nightAmount(t); expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThanOrEqual(1); }
  });
});
