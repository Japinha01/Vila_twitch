import { describe, expect, it } from 'vitest';
import { GRID_H, GRID_W } from '../src/sim/config';
import { World } from '../src/sim/world';

describe('beira d\'água', () => {
  it('casas e prédios não grudam na água: um tile de folga', () => {
    const w = new World(3);
    for (const kind of ['house', 'warehouse', 'market'] as const) {
      let checked = 0;
      for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
        if (!w.canPlace(kind, x, y).ok && !('reason' in w.canPlace(kind, x, y) && (w.canPlace(kind, x, y) as { reason: string }).reason === 'cost')) continue;
        for (let j = -1; j <= 2; j++) for (let i = -1; i <= 2; i++) {
          const tx = x + i, ty = y + j;
          if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) continue;
          expect(w.water[w.idx(tx, ty)]).toBeLessThanOrEqual(0.05);
        }
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    }
  });
});
