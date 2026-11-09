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
let canvas = document.getElementById('game') as HTMLCanvasElement;
// Visual: 3D low poly por padrão; ?2d (ou o botão do painel) usa o isométrico 2D.
// A escolha fica salva no navegador; se o WebGL falhar, cai sozinho para o 2D.
const params = new URLSearchParams(location.search);
const PREF_KEY = 'vila-do-chat:visual';
const readPref = (): string | null => { try { return localStorage.getItem(PREF_KEY); } catch { return null; } };
let mode: '2d' | '3d' = params.has('2d') ? '2d' : params.has('3d') ? '3d' : readPref() === '2d' ? '2d' : '3d';
let r3: GameView | undefined;
if (mode === '3d') {
  try {
    const { Renderer3D } = await import('./render/renderer3d');
    r3 = new Renderer3D(canvas, world);
  } catch (err) {
    console.warn('3D indisponível, usando o visual 2D.', err);
    mode = '2d';
    // o canvas pode ter ficado preso a um contexto WebGL falho: troca por um novo
    const fresh = canvas.cloneNode(false) as HTMLCanvasElement;
    canvas.replaceWith(fresh);
    canvas = fresh;
  }
}
const renderer: GameView = r3 ?? new Renderer(canvas, world);
const visualBtn = document.getElementById('visual') as HTMLButtonElement;
visualBtn.textContent = mode === '3d' ? '🧊 3D' : '🗺 2D';
visualBtn.title = 'Alternar entre o visual 3D e o 2D';
visualBtn.addEventListener('click', () => {
  try { localStorage.setItem(PREF_KEY, mode === '3d' ? '2d' : '3d'); } catch { /* sem armazenamento: vale só para esta aba */ }
  saveGame(world); // mantém o progresso ao recarregar
  const u = new URL(location.href);
  u.searchParams.delete('2d'); u.searchParams.delete('3d');
  location.href = u.toString();
});
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
