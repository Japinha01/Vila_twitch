export type Resource = 'wood' | 'stone' | 'food' | 'water';
export type Job = Resource | 'build';
export type BuildingKind = 'townhall' | 'house' | 'farm' | 'well' | 'sawmill' | 'quarry' | 'warehouse';
export type NodeKind = 'tree' | 'rock' | 'bush' | 'water';

export type Stock = Record<Resource, number>;

export interface ResourceNode {
  id: number;
  kind: NodeKind;
  x: number; // tile
  y: number;
  amount: number; // Infinity para água
}

export interface Building {
  id: number;
  kind: BuildingKind;
  x: number; // canto superior esquerdo (tile)
  y: number;
  size: number; // lado em tiles
  progress: number; // trabalho acumulado
  workNeeded: number;
  done: boolean;
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
  targetId: number | null; // id de nó ou prédio
  carry: number;
  carryRes: Resource | null;
  workLeft: number;
  xp: number;
}

export const RESOURCES: Resource[] = ['wood', 'stone', 'food', 'water'];
