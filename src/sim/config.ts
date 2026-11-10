import type { BuildingKind, Resource, Stock } from './types';

export const TICKS_PER_SECOND = 10;
export const TICKS_PER_DAY = 600; // 1 dia = 60 s no x1

export const GRID_W = 72;
export const GRID_H = 52;
export const MAP_SCALE = (GRID_W * GRID_H) / (48 * 34); // quanto o mapa é maior que o original (conta de recursos, lagos)

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
export const AUTO_JOB_MARGIN = 1; // só troca de profissão se a nova pedir pelo menos 1 aldeão a mais que a atual
export const AUTO_HOUSE_RESERVE = 10; // madeira que sobra depois de uma casa feita sozinhos
export const AUTO_BRIDGE_MIN_STRANDED = 3; // recursos do outro lado do rio para valer uma ponte
export const AUTO_BRIDGE_WADE_MIN = 25; // passos de aldeões com água até o joelho num trecho do rio que valem uma ponte
export const AUTO_BRIDGE_MAX_SPAN = 6; // largura máxima do rio que eles se arriscam a atravessar
export const AUTO_BUILD_MAX_DIST = 24; // alcance da procura de terreno ao redor da prefeitura

// ---- terreno ----
export const MAX_HEIGHT = 9;
export const DIG_COST: Partial<Record<Resource, number>> = { wood: 1 }; // por tile, por nível
export const RAISE_COST: Partial<Record<Resource, number>> = { stone: 1 };
export const SPRING_COST: Partial<Record<Resource, number>> = { stone: 8, wood: 4 };
export const SPRING_RATE = 0.03; // água por passo de uma nascente criada (sustenta um lago pequeno)
export const MAX_SPRINGS = 16;
export const AUTO_CANAL_MAX_LEN = 26; // maior canal que os aldeões cavam de uma vez
export const AUTO_CANAL_MAX_DEPTH = 2; // níveis que eles se dispõem a cavar num tile
export const AUTO_CANAL_MAX = 4; // canais por vila
export const AUTO_DRAIN_MAX = 8; // canais de drenagem por vila (alagamentos)
export const AUTO_DRAIN_LEN = 60; // maior canal de drenagem de uma vez
export const AUTO_DRAIN_ROUNDS = 2; // rodadas de autonomia seguidas com prédio alagado antes de cavar

// ---- estradas, zonas e comércio ----
export const ROAD_COST: Partial<Record<Resource, number>> = { wood: 2, stone: 1 }; // por tile, na hora
export const ROAD_STEP_COST = 0.55; // andar em estrada custa menos na rota
export const ROAD_SPEED = 1.7; // e é mais rápido
export const MARKET_RELIEF = 0.08; // cada mercado pronto reduz o consumo de comida e água
export const MARKET_RELIEF_MAX = 0.4;
export const AUTO_ROAD_MAX_LEN = 40; // maior estrada que eles abrem de uma vez até uma zona
export const AUTO_ROAD_RESERVE = 45; // madeira que precisa sobrar para fazerem estrada até um prédio
export const AUTO_ROAD_PER_PASS = 12; // tiles de estrada por decisão

export const BASE_POP_CAP = 10;
export const HOUSE_POP = 4;
export const BASE_STORAGE = 100;
export const WAREHOUSE_STORAGE = 100;

export const SAWMILL_BONUS = 1.5;
// Ferramentas de pedra: os aldeões fabricam sozinhos; quanto mais gente armada, mais rende a coleta.
export const AXE_COST: Partial<Record<'wood' | 'stone', number>> = { wood: 4, stone: 2 };
export const PICK_COST: Partial<Record<'wood' | 'stone', number>> = { wood: 4, stone: 3 };
export const TOOL_BONUS = 0.6; // +60% com um machado (ou picareta) para cada aldeão
export const TOOL_RESERVE = { wood: 20, stone: 6 }; // só fabrica se sobrar isto depois
export const QUARRY_BONUS = 1.5;

export const SUPPORT_BONUS = 1.25;
export const SUPPORT_TICKS = 300;
export const SUPPORT_MAX_TICKS = 900;

export const START_STOCK: Stock = { wood: 60, stone: 30, food: 30, water: 30 };

export const NODE_MAX = { tree: 40, rock: 40, bush: 25 } as const;
// ---- floresta e clareira ----
export const CLEARING_RADIUS = 3.2; // raio sem árvores ao redor da fogueira no começo
export const FOREST_NEAR = 0.5; // chance de árvore por tile perto do acampamento (floresta fechada)
export const FOREST_FAR = 0.1; // e longe dele
export const FOREST_FADE_START = 6; // distância onde a floresta começa a rarear
export const FOREST_FADE_LEN = 24; // e a distância em que chega ao mínimo
export const SAPLING_CHANCE = 0.08; // por rebrota: chance de nascer uma muda perto de uma árvore
export const SAPLING_GROW_EVERY = 3; // muda fora do solo irrigado cresce a cada tantas rebrotas
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
  market: { label: 'Mercado', w: 2, h: 2, cost: { wood: 30, stone: 10 }, work: 140 },
  waterwheel: { label: 'Roda d\'água', w: 2, h: 2, cost: { wood: 35, stone: 15 }, work: 160 },
};

export const RESOURCE_LABEL: Record<Resource, string> = {
  wood: 'madeira',
  stone: 'pedra',
  food: 'comida',
  water: 'água',
};

export const WAITLIST_MAX = 200; // fila de espera: quantos viewers cabem

// Minas de pedra: só nelas se constrói pedreira (e nada mais)
export const MINE_VEINS = 3; // jazidas por mapa de tamanho base (cresce com a raiz da escala do mapa)
export const MINE_MIN_DIST = 11; // longe da fogueira
export const QUARRY_MAX_DIST = 45; // até onde a vila procura mina para a pedreira

// Energia: rodas d'água (viram turbinas e usinas com as eras) alimentam serrarias, pedreiras e mercados
export const POWER_SUPPLY = [10, 10, 10, 20, 20, 35, 35, 60]; // por roda, por era (com água suficiente)
export const POWER_DEMAND: Partial<Record<'sawmill' | 'quarry' | 'market', number>> = { sawmill: 4, quarry: 6, market: 3 };
export const POWER_BONUS = 0.5; // +50% de rendimento com energia plena
export const POWER_WATER_FULL = 3; // tiles de água (profundidade >= 1) em volta para a roda render 100%
