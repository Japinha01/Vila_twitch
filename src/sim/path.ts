import { GRID_H, GRID_W } from './config';

const N = GRID_W * GRID_H;
const dist = new Float32Array(N);
const prev = new Int32Array(N);
const done = new Uint8Array(N);

// vizinhança de 8 direções: [dx, dy, custo]
const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** Heap binário de (custo, tile); desempate por tile para manter o resultado determinístico. */
class Heap {
  private c: number[] = [];
  private t: number[] = [];
  get size(): number { return this.t.length; }
  clear(): void { this.c.length = 0; this.t.length = 0; }
  private less(a: number, b: number): boolean {
    return this.c[a] < this.c[b] || (this.c[a] === this.c[b] && this.t[a] < this.t[b]);
  }
  private swap(a: number, b: number): void {
    [this.c[a], this.c[b]] = [this.c[b], this.c[a]];
    [this.t[a], this.t[b]] = [this.t[b], this.t[a]];
  }
  push(cost: number, tile: number): void {
    this.c.push(cost); this.t.push(tile);
    let i = this.t.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p); i = p;
    }
  }
  pop(): number {
    const top = this.t[0];
    const lc = this.c.pop()!, lt = this.t.pop()!;
    if (this.t.length) {
      this.c[0] = lc; this.t[0] = lt;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.t.length && this.less(l, m)) m = l;
        if (r < this.t.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
}
const heap = new Heap();

/**
 * Menor caminho (Dijkstra) do tile `start` até o primeiro tile que satisfaz `isGoal`.
 * `step(from, to)` devolve o custo de andar entre tiles vizinhos, ou Infinity se bloqueado.
 * Devolve a lista de tiles a percorrer (sem o inicial), [] se já está na meta, ou null se inalcançável.
 */
export function findPath(
  start: number,
  isGoal: (tile: number) => boolean,
  step: (from: number, to: number) => number,
): number[] | null {
  dist.fill(Infinity); prev.fill(-1); done.fill(0);
  heap.clear();
  dist[start] = 0;
  heap.push(0, start);
  while (heap.size) {
    const cur = heap.pop();
    if (done[cur]) continue;
    done[cur] = 1;
    if (isGoal(cur)) {
      const out: number[] = [];
      for (let t = cur; t !== start; t = prev[t]) out.push(t);
      return out.reverse();
    }
    const x = cur % GRID_W, y = (cur - x) / GRID_W;
    for (const [dx, dy, base] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      const nt = ny * GRID_W + nx;
      if (done[nt]) continue;
      const c = step(cur, nt);
      if (c === Infinity) continue;
      if (dx !== 0 && dy !== 0) { // sem cortar quina: as duas laterais precisam ser livres
        if (step(cur, y * GRID_W + nx) === Infinity || step(cur, ny * GRID_W + x) === Infinity) continue;
      }
      const nd = dist[cur] + base * c;
      if (nd < dist[nt]) { dist[nt] = nd; prev[nt] = cur; heap.push(nd, nt); }
    }
  }
  return null;
}
