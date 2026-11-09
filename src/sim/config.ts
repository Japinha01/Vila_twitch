import type { BuildingKind, Resource, Stock } from './types';

export const TICKS_PER_SECOND = 10;
export const TICKS_PER_DAY = 600; // 1 dia = 60 s no x1

export const GRID_W = 40;
export const GRID_H = 26;

export const MOVE_SPEED = 0.1; // tiles por tick
export const REACH = 1.4; // distância para interagir com nó/prédio
export const GATHER_TICKS = 30;
export const CARRY_CAPACITY = 5;
export const CONSUME_EVERY = 150; // ticks entre refeições
export const STARVING_SLOWDOWN = 0.5;

export const BASE_POP_CAP = 10;
export const HOUSE_POP = 4;
export const BASE_STORAGE = 100;
export const WAREHOUSE_STORAGE = 100;

export const SAWMILL_BONUS = 1.5;
export const QUARRY_BONUS = 1.5;

export const SUPPORT_BONUS = 1.25;
export const SUPPORT_TICKS = 300;
export const SUPPORT_MAX_TICKS = 900;

export const START_STOCK: Stock = { wood: 50, stone: 20, food: 30, water: 30 };

export const NODE_AMOUNT = { tree: 40, rock: 40, bush: 25 } as const;

export interface BuildingSpec {
  label: string;
  size: number;
  cost: Partial<Record<Resource, number>>;
  work: number;
}

export const BUILDINGS: Record<Exclude<BuildingKind, 'townhall'>, BuildingSpec> = {
  house: { label: 'Casa', size: 2, cost: { wood: 25, stone: 5 }, work: 120 },
  farm: { label: 'Fazenda', size: 2, cost: { wood: 20 }, work: 100 },
  well: { label: 'Poço', size: 2, cost: { wood: 5, stone: 15 }, work: 80 },
  sawmill: { label: 'Serraria', size: 2, cost: { wood: 30, stone: 10 }, work: 150 },
  quarry: { label: 'Pedreira', size: 2, cost: { wood: 40, stone: 5 }, work: 150 },
  warehouse: { label: 'Armazém', size: 2, cost: { wood: 40, stone: 20 }, work: 180 },
};

export const RESOURCE_LABEL: Record<Resource, string> = {
  wood: 'madeira',
  stone: 'pedra',
  food: 'comida',
  water: 'água',
};
