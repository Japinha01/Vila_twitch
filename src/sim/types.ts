export type Resource = 'wood' | 'stone' | 'food' | 'water';
export type Job = Resource | 'build';
export type BuildingKind = 'townhall' | 'house' | 'farm' | 'well' | 'sawmill' | 'quarry' | 'warehouse' | 'dam' | 'bridge' | 'market' | 'waterwheel';
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
  /** userId do viewer dono do estabelecimento (líder da profissão ligada ao prédio) */
  owner?: string;
  /** rodadas de autonomia seguidas alagado (para os aldeões decidirem entre drenar, aterrar e demolir) */
  floodAge?: number;
  /** já foi aterrado uma vez */
  filled?: boolean;
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
  /** true = o viewer escolheu a profissão com !trabalhar; false/ausente = o aldeão decide sozinho */
  ordered?: boolean;
  /** experiência por profissão, na ordem de JOBS: a maior define a profissão do viewer */
  skill?: number[];
  /** morador NPC: completa a população quando preciso; sai quando um viewer precisa da vaga */
  npc?: boolean;
}

export const JOBS: Job[] = ['wood', 'stone', 'food', 'water', 'build'];
export const RESOURCES: Resource[] = ['wood', 'stone', 'food', 'water'];

/** Zonas pintadas pelo streamer: 0 nenhuma, 1 residencial, 2 comercial, 3 industrial. */
export type ZoneKind = 0 | 1 | 2 | 3;
