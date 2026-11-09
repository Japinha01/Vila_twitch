export type Resource = 'wood' | 'stone' | 'food' | 'water';
export type Job = Resource | 'build';
export type BuildingKind = 'townhall' | 'house' | 'farm' | 'well' | 'sawmill' | 'quarry' | 'warehouse' | 'dam';
export type NodeKind = 'tree' | 'rock' | 'bush';

export type Stock = Record<Resource, number>;

export interface ResourceNode {
  id: number;
  kind: NodeKind;
  x: number; // tile
  y: number;
  amount: number; // árvores e arbustos rebrotam com água; pedras só acabam
}

export interface Building {
  id: number;
  kind: BuildingKind;
  x: number; // canto de menor x/y (tile)
  y: number;
  w: number;
  h: number;
  progress: number; // trabalho acumulado
  workNeeded: number;
  done: boolean;
  priority: boolean; // obra prioritária: construtores vão primeiro
  flooded: boolean; // água acima de FLOOD_DEPTH sobre o prédio: ele não funciona
}

export type VillagerState = 'idle' | 'toTarget' | 'working' | 'toStore';

export interface Villager {
  id: number;
  userId: string;
  name: string;
  color: string;
  x: number; // posição contínua, em tiles
  y: number;
  job: Job;
  state: VillagerState;
  /** id de nó/prédio; negativo = tile de água (-(índice+1)) */
  targetId: number | null;
  carry: number;
  carryRes: Resource | null;
  workLeft: number;
  xp: number;
  /** rota atual (tiles a percorrer); null = ainda não calculada */
  path: number[] | null;
  pi: number; // próximo ponto da rota
  wait: number; // ticks de espera antes de tentar de novo
}

export const RESOURCES: Resource[] = ['wood', 'stone', 'food', 'water'];
