import type { BuildingKind } from './types';

/** O que a vila tem agora, para medir as metas de uma era (só prédios prontos contam). */
export interface EraSnapshot {
  pop: number;
  done: Partial<Record<BuildingKind, number>>;
}

export interface EraGoal { label: string; icon: string; have: (s: EraSnapshot) => number; need: number }

export interface Era {
  name: string;
  icon: string;
  tagline: string;
  /** metas para CHEGAR a esta era (a era 0 não tem) */
  goals: EraGoal[];
}

const built = (k: BuildingKind) => (s: EraSnapshot): number => s.done[k] ?? 0;

export const ERAS: Era[] = [
  { name: 'Era da Pedra', icon: '🪨', tagline: 'Paus, pedras e muita vontade de sobreviver.', goals: [] },
  {
    name: 'Era do Bronze', icon: '🏺', tagline: 'Fazendas e poços: a comida e a água deixam de faltar.',
    goals: [
      { label: 'aldeões', icon: '👥', have: (s) => s.pop, need: 8 },
      { label: 'casa', icon: '🏠', have: built('house'), need: 1 },
      { label: 'fazenda', icon: '🌾', have: built('farm'), need: 1 },
      { label: 'poço', icon: '💧', have: built('well'), need: 1 },
    ],
  },
  {
    name: 'Era Medieval', icon: '🏰', tagline: 'Armazéns cheios e uma vila de verdade.',
    goals: [
      { label: 'aldeões', icon: '👥', have: (s) => s.pop, need: 16 },
      { label: 'casas', icon: '🏠', have: built('house'), need: 3 },
      { label: 'fazendas', icon: '🌾', have: built('farm'), need: 2 },
      { label: 'armazém', icon: '📦', have: built('warehouse'), need: 1 },
    ],
  },
  {
    name: 'Era da Cidade', icon: '🏙', tagline: 'Uma cidade que cresce sozinha. O Estado vem a seguir!',
    goals: [
      { label: 'aldeões', icon: '👥', have: (s) => s.pop, need: 30 },
      { label: 'casas', icon: '🏠', have: built('house'), need: 6 },
      { label: 'poços', icon: '💧', have: built('well'), need: 3 },
      { label: 'armazéns', icon: '📦', have: built('warehouse'), need: 2 },
      { label: 'mercado', icon: '🏪', have: built('market'), need: 1 },
    ],
  },
];

export const goalsMet = (era: number, s: EraSnapshot): boolean =>
  !!ERAS[era] && ERAS[era].goals.every((g) => g.have(s) >= g.need);

/** Texto das metas da próxima era, ex.: "👥 5/8 · 🏠 0/1". Vazio na última era. */
export function nextEraSummary(era: number, s: EraSnapshot): string {
  const next = ERAS[era + 1];
  if (!next) return '';
  return `${next.icon} ${next.name}: ` + next.goals.map((g) => `${g.icon} ${Math.min(g.have(s), g.need)}/${g.need}`).join(' · ');
}
