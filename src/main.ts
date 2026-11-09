import { CommandProcessor } from './chat/commands';
import { Renderer } from './render/renderer';
import type { GameView } from './render/view';
import { TICKS_PER_SECOND } from './sim/config';
import { World } from './sim/world';
import { Panel } from './ui/panel';
import { clearSave, loadGame, saveGame } from './ui/save';

const loaded = loadGame();
const world = loaded ?? new World(Math.floor(Math.random() * 1e9)); // seed só para o mapa novo
const chat = new CommandProcessor(world, { now: () => performance.now() });
const canvas = document.getElementById('game') as HTMLCanvasElement;
// ?3d liga o visual 3D low poly (em construção); o padrão continua o isométrico 2D
const want3d = new URLSearchParams(location.search).has('3d');
let renderer: GameView;
if (want3d) {
  const { Renderer3D } = await import('./render/renderer3d');
  renderer = new Renderer3D(canvas, world);
} else {
  renderer = new Renderer(canvas, world);
}
const panel = new Panel(world, chat, renderer);

// ---- salvar: automático a cada 30 s, ao sair da aba e pelo botão ----
let saveEnabled = true;
const doSave = (): boolean => saveEnabled && saveGame(world);
setInterval(doSave, 30000);
document.addEventListener('visibilitychange', () => { if (document.hidden) doSave(); });
window.addEventListener('beforeunload', doSave);
panel.onSave = () => { const ok = doSave(); panel.addLog(ok ? '💾 Vila salva neste navegador.' : '⚠ Não foi possível salvar (armazenamento bloqueado ou cheio).', 'ev'); };
panel.onNew = () => {
  if (!window.confirm('Apagar a vila salva e começar uma nova?')) return;
  saveEnabled = false; // senão o autosave de saída recriaria a vila antiga
  clearSave();
  location.reload();
};
if (loaded) panel.addLog(`💾 Vila carregada (dia ${world.day}).`, 'ev');

let last = performance.now();
let acc = 0;

function frame(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000); // evita salto ao voltar de outra aba
  last = now;
  chat.process();
  acc += dt * TICKS_PER_SECOND * panel.speed;
  let steps = 0;
  while (acc >= 1 && steps++ < 60) { world.step(); acc -= 1; }
  if (steps >= 60) acc = 0;
  renderer.draw();
  panel.update();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// gancho para testes no navegador / depuração
(window as unknown as { __vila: unknown }).__vila = { world, chat, renderer };
