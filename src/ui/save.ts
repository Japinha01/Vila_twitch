import { World, type SaveData } from '../sim/world';

const KEY = 'vila-do-chat:save:v1';

/** localStorage pode falhar (modo privado, cota cheia, bloqueado): tudo aqui é protegido. */
export function saveGame(world: World): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(world.serialize()));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(): World | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return World.fromSave(JSON.parse(raw) as SaveData);
  } catch {
    return null; // save corrompido ou de outra versão: começa uma vila nova
  }
}

export function clearSave(): void {
  try { localStorage.removeItem(KEY); } catch { /* sem armazenamento: nada a apagar */ }
}
