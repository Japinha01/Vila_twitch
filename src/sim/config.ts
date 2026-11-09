import type { BuildingKind, Resource, Stock } from './types';

export const TICKS_PER_SECOND = 10;
export const TICKS_PER_DAY = 600; // 1 dia = 60 s no x1

export const GRID_W = 48;
export const GRID_H = 34;

// ---- estações ----
export const TEMPERATE_DAYS = 4;
export const DROUGHT_DAYS = 2;

// ---- água ----
export const FLOW_EVERY = 4; // ticks entre passos de água
export const SOURCE_RATE = 0.4; // água que cada nascente injeta por passo (só na estação temperada)
export const FLOW_FRACTION = 0.2; // fração da diferença de nível que escorre por vizinho
export const CONVEY = 0.6; // fração da água do leito que avança rio abaixo por passo
export const EVAP_TEMPERATE = 0.0003;
export const EVAP_DROUGHT = 0.004;
export const WET_DEPTH = 0.25; // profundidade mínima para contar como "água" (irrigação, coleta)
export const IRRIGATION_RADIUS = 5;
export const MOISTURE_RATE = 0.01; // por passo de água
export const WELL_RANGE = 3.5; // poço só rende com água a esta distância
export const DAM_RAISE = 2; // quanto a represa sobe o terreno
export const FLOOD_DEPTH = 0.3; // água a partir daqui alaga o prédio e ele para de funcionar
export const DROUGHT_WARNING_DAYS = 1; // avisa a seca com esta antecedência
export const DEMOLISH_REFUND = 0.5; // fração do custo devolvida ao demolir um prédio pronto

// ---- aldeões ----
export const MOVE_SPEED = 0.1; // tiles por tick
export const WATER_SLOWDOWN = 0.5;
export const WADE_SLOW_DEPTH = 0.3; // acima disso andar custa mais e é mais lento
export const MAX_WADE = 1.0; // acima disso a água fecha o caminho
export const MAX_STEP = 1; // desnível máximo entre tiles vizinhos (degrau); mais que isso é penhasco
export const RETRY_TICKS = 20; // espera antes de procurar outra tarefa quando não há caminho
export const REACH = 1.4;
export const GATHER_TICKS = 30;
export const CARRY_CAPACITY = 5;
export const CONSUME_EVERY = 150;
export const STARVING_SLOWDOWN = 0.5;

// ---- autonomia dos aldeões ----
export const AUTONOMY_EVERY = 100; // ticks entre decisões (10 s no x1)
export const AUTO_JOB_MARGIN = 15; // só troca de profissão se a nova for bem mais necessária
export const AUTO_HOUSE_RESERVE = 10; // madeira que sobra depois de uma casa feita sozinhos
export const AUTO_BRIDGE_MIN_STRANDED = 3; // recursos do outro lado do rio para valer uma ponte
export const AUTO_BRIDGE_WADE_MIN = 25; // passos de aldeões com água até o joelho num trecho do rio que valem uma ponte
export const AUTO_BRIDGE_MAX_SPAN = 6; // largura máxima do rio que eles se arriscam a atravessar
export const AUTO_BUILD_MAX_DIST = 14; // alcance da procura de terreno ao redor da prefeitura

export const BASE_POP_CAP = 10;
export const HOUSE_POP = 4;
export const BASE_STORAGE = 100;
export const WAREHOUSE_STORAGE = 100;

export const SAWMILL_BONUS = 1.5;
export const QUARRY_BONUS = 1.5;

export const SUPPORT_BONUS = 1.25;
export const SUPPORT_TICKS = 300;
export const SUPPORT_MAX_TICKS = 900;

export const START_STOCK: Stock = { wood: 60, stone: 30, food: 30, water: 30 };

export const NODE_MAX = { tree: 40, rock: 40, bush: 25 } as const;
export const MIN_HARVEST = 8; // abaixo disso a árvore/arbusto ainda é muda
export const REGROW_EVERY = 20; // ticks por +1 de rebrota (só em solo irrigado)

export interface BuildingSpec {
  label: string;
  w: number;
  h: number;
  cost: Partial<Record<Resource, number>>;
  work: number;
  slots?: number; // vagas de trabalhadores simultâneos
}

export const BUILDINGS: Record<Exclude<BuildingKind, 'townhall'>, BuildingSpec> = {
  house: { label: 'Casa', w: 2, h: 2, cost: { wood: 25, stone: 5 }, work: 120 },
  farm: { label: 'Fazenda', w: 2, h: 2, cost: { wood: 20 }, work: 100, slots: 3 },
  well: { label: 'Poço', w: 2, h: 2, cost: { wood: 5, stone: 15 }, work: 80, slots: 2 },
  sawmill: { label: 'Serraria', w: 2, h: 2, cost: { wood: 30, stone: 10 }, work: 150 },
  quarry: { label: 'Pedreira', w: 2, h: 2, cost: { wood: 40, stone: 5 }, work: 150, slots: 3 },
  warehouse: { label: 'Armazém', w: 2, h: 2, cost: { wood: 40, stone: 20 }, work: 180 },
  dam: { label: 'Represa', w: 2, h: 1, cost: { wood: 30, stone: 20 }, work: 150 },
  bridge: { label: 'Ponte', w: 1, h: 1, cost: { wood: 8 }, work: 40 },
};

export const RESOURCE_LABEL: Record<Resource, string> = {
  wood: 'madeira',
  stone: 'pedra',
  food: 'comida',
  water: 'água',
};
