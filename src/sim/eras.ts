import type { BuildingKind } from './types';

/** O que a vila tem agora, para medir as metas de uma era (só prédios prontos contam). */
export interface EraSnapshot {
  pop: number;
  done: Partial<Record<BuildingKind, number>>;
}

export interface EraGoal { label: string; icon: string; have: (s: EraSnapshot) => number; need: number; kind?: BuildingKind }

export interface Era {
  name: string;
  icon: string;
  tagline: string;
  /** metas para CHEGAR a esta era (a era 0 não tem) */
  goals: EraGoal[];
  /** vantagens que a era traz (acumulam com as anteriores) */
  perks: string;
}

const built = (k: BuildingKind) => (s: EraSnapshot): number => s.done[k] ?? 0;

export const ERAS: Era[] = [
  { name: 'Era da Pedra', icon: '🪨', tagline: 'Paus, pedras e muita vontade de sobreviver.', goals: [], perks: '' },
  {
    name: 'Era do Bronze', icon: '🏺', tagline: 'Fazendas e poços: a comida e a água deixam de faltar.',
    goals: [
      { label: 'aldeões', icon: '👥', have: (s) => s.pop, need: 8 },
      { label: 'casa', icon: '🏠', have: built('house'), need: 1 },
      { label: 'fazenda', icon: '🌾', have: built('farm'), need: 1 },
      { label: 'poço', icon: '💧', have: built('well'), need: 1 },
    ],
    perks: '',
  },
  {
    name: 'Era Medieval', icon: '🏰', tagline: 'A fogueira virou prefeitura e a vila ganhou armazéns.',
    goals: [
      { label: 'aldeões', icon: '👥', have: (s) => s.pop, need: 16 },
      { label: 'casas', icon: '🏠', have: built('house'), need: 3 },
      { label: 'fazendas', icon: '🌾', have: built('farm'), need: 2 },
      { label: 'armazém', icon: '📦', have: built('warehouse'), need: 1, kind: 'warehouse' },
    ],
    perks: '+5% de coleta',
  },
  {
    name: 'Era da Cidade', icon: '🏙', tagline: 'Uma cidade que cresce sozinha. O Estado vem a seguir!',
    goals: [
      { label: 'aldeões', icon: '👥', have: (s) => s.pop, need: 30 },
      { label: 'casas', icon: '🏠', have: built('house'), need: 6 },
      { label: 'poços', icon: '💧', have: built('well'), need: 3 },
      { label: 'armazéns', icon: '📦', have: built('warehouse'), need: 2 },
      { label: 'mercado', icon: '🏪', have: built('market'), need: 1, kind: 'market' },
    ],
    perks: '+15% de coleta',
  },
  {
    name: 'Era Industrial', icon: '🏭', tagline: 'Serrarias e pedreiras a todo vapor: prédios de tijolo e mais gente por teto.',
    goals: [
      { label: 'aldeões', icon: '👥', have: (s) => s.pop, need: 40 },
      { label: 'casas', icon: '🏠', have: built('house'), need: 9 },
      { label: 'serraria', icon: '🪚', have: built('sawmill'), need: 1, kind: 'sawmill' },
      { label: 'pedreira', icon: '⛏', have: built('quarry'), need: 1, kind: 'quarry' },
      { label: 'mercados', icon: '🏪', have: built('market'), need: 2, kind: 'market' },
      { label: "roda d'água", icon: '⚡', have: built('waterwheel'), need: 1, kind: 'waterwheel' },
    ],
    perks: '+35% de coleta · +1 morador por casa',
  },
  {
    name: 'Era do Estado', icon: '🏛', tagline: 'A prefeitura virou palácio de governo. Impostos e ordem pública.',
    goals: [
      { label: 'aldeões', icon: '👥', have: (s) => s.pop, need: 60 },
      { label: 'casas', icon: '🏠', have: built('house'), need: 13 },
      { label: 'armazéns', icon: '📦', have: built('warehouse'), need: 4, kind: 'warehouse' },
      { label: 'mercados', icon: '🏪', have: built('market'), need: 3, kind: 'market' },
      { label: 'poços', icon: '💧', have: built('well'), need: 5 },
    ],
    perks: '+50% de coleta · estoque +25%',
  },
  {
    name: 'Era da Nação', icon: '🚩', tagline: 'Várias cidades, uma bandeira. A vila virou capital.',
    goals: [
      { label: 'aldeões', icon: '👥', have: (s) => s.pop, need: 90 },
      { label: 'casas', icon: '🏠', have: built('house'), need: 20 },
      { label: 'fazendas', icon: '🌾', have: built('farm'), need: 8 },
      { label: 'mercados', icon: '🏪', have: built('market'), need: 5, kind: 'market' },
      { label: 'armazéns', icon: '📦', have: built('warehouse'), need: 6, kind: 'warehouse' },
    ],
    perks: '+70% de coleta · +2 moradores por casa · estoque +50%',
  },
  {
    name: 'Era do Futuro', icon: '🚀', tagline: 'Torres de vidro, energia limpa e rumo às estrelas.',
    goals: [
      { label: 'aldeões', icon: '👥', have: (s) => s.pop, need: 130 },
      { label: 'casas', icon: '🏠', have: built('house'), need: 30 },
      { label: 'mercados', icon: '🏪', have: built('market'), need: 8, kind: 'market' },
      { label: 'armazéns', icon: '📦', have: built('warehouse'), need: 8, kind: 'warehouse' },
      { label: 'poços', icon: '💧', have: built('well'), need: 8 },
    ],
    perks: '+100% de coleta · +3 moradores por casa · estoque +100%',
  },
];

/** Multiplicador de coleta (madeira e pedra) que a era dá à vila. */
export const ERA_GATHER = [1, 1, 1.05, 1.15, 1.35, 1.5, 1.7, 2];
/** Moradores a mais por casa pronta, por era. */
export const ERA_HOUSE_POP = [0, 0, 0, 0, 1, 1, 2, 3];
/** Multiplicador do limite de estoque, por era. */
export const ERA_STORAGE = [1, 1, 1, 1, 1, 1.25, 1.5, 2];
const at = (a: number[], era: number): number => a[Math.max(0, Math.min(a.length - 1, era))];
export const eraGather = (era: number): number => at(ERA_GATHER, era);
export const eraHousePop = (era: number): number => at(ERA_HOUSE_POP, era);
export const eraStorage = (era: number): number => at(ERA_STORAGE, era);

export const goalsMet = (era: number, s: EraSnapshot): boolean =>
  !!ERAS[era] && ERAS[era].goals.every((g) => g.have(s) >= g.need);

/** Texto das metas da próxima era, ex.: "👥 5/8 · 🏠 0/1". Vazio na última era. */
export function nextEraSummary(era: number, s: EraSnapshot): string {
  const next = ERAS[era + 1];
  if (!next) return '';
  return `${next.icon} ${next.name}: ` + next.goals.map((g) => `${g.icon} ${Math.min(g.have(s), g.need)}/${g.need}`).join(' · ');
}
