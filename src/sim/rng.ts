export interface Rng {
  (): number;
  /** estado interno, para salvar e continuar a mesma sequência depois */
  getState(): number;
  setState(s: number): void;
}

/** Gerador pseudoaleatório determinístico (mulberry32): mesma seed, mesma sequência. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Object.assign(next, { getState: () => a, setState: (s: number) => { a = s >>> 0; } });
}

/** Hash simples de string para número (usado para cores/nomes estáveis por viewer). */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
