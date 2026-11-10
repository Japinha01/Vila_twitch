import { BUILDINGS, MIN_HARVEST, NODE_MAX, RESOURCE_LABEL } from '../sim/config';
import type { Job } from '../sim/types';
import type { PlaceableKind, World } from '../sim/world';

export const JOB_LABEL: Record<Job, string> = {
  wood: 'lenhador', stone: 'pedreiro', food: 'fazendeiro', water: 'aguadeiro', build: 'construtor',
};

/** Linhas de texto descrevendo o que há no tile (aldeões, prédio, recurso, água e solo). */
export function describeTile(w: World, x: number, y: number): string[] {
  const out: string[] = [];
  const i = w.idx(x, y);

  for (const v of w.villagers) {
    if (Math.floor(v.x) !== x || Math.floor(v.y) !== y) continue;
    const load = v.carryRes ? `, carregando ${v.carry} de ${RESOURCE_LABEL[v.carryRes]}` : '';
    out.push(`👤 ${v.name}: ${JOB_LABEL[v.job]}${load}`);
  }

  const b = w.buildingAt(x, y);
  if (b) {
    const label = b.kind === 'townhall' ? (w.era < 2 ? 'Fogueira' : w.era < 5 ? 'Prefeitura' : 'Palácio de governo') : BUILDINGS[b.kind as PlaceableKind].label;
    if (!b.done) {
      out.push(`🏗 ${label}: em obras ${Math.round((b.progress / b.workNeeded) * 100)}%${b.priority ? ' ★ prioridade' : ''}`);
    } else {
      out.push(`🏠 ${label}`);
      if (b.flooded) out.push('🌊 Alagado: parado até secar');
      const slots = b.kind === 'townhall' ? undefined : BUILDINGS[b.kind as PlaceableKind].slots;
      if (slots) out.push(`Trabalhadores ${w.workersAt(b)}/${slots}`);
      if ((b.kind === 'farm' || b.kind === 'well') && !b.flooded && !w.buildingWorks(b)) {
        out.push(b.kind === 'farm' ? '☀ Sem irrigação: não produz' : '☀ Sem água por perto: não rende');
      }
    }
  }

  const n = w.nodes.find((o) => o.x === x && o.y === y);
  if (n) {
    const max = NODE_MAX[n.kind];
    if (n.kind === 'tree') out.push(n.amount < MIN_HARVEST ? `🌱 Muda de árvore (${n.amount}/${max}), crescendo` : `🌳 Árvore (${n.amount}/${max} de madeira)`);
    else if (n.kind === 'bush') out.push(n.amount < MIN_HARVEST ? `🌱 Arbusto rebrotando (${n.amount}/${max})` : `🫐 Arbusto (${n.amount}/${max} de comida)`);
    else out.push(`🪨 Pedra (${n.amount}/${max})`);
  }

  const depth = w.water[i];
  if (depth >= 0.04) out.push(`💧 Água, profundidade ${depth.toFixed(1)}`);
  if (w.dam[i]) out.push('🧱 Represa');
  if (w.mine[i]) out.push('⛰ Mina de pedra · só pedreiras');
  out.push(`${w.irrigated[i] ? '🌿 Solo irrigado' : '🏜 Solo seco'} · altura ${w.height[i]}`);
  return out;
}
