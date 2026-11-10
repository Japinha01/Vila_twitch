import { OverlayMirror, type CameraArr } from './cloud/frames';
import { RESOURCES } from './sim/types';
import { isValidToken, OverlayViewer, type ViewerHandlers } from './cloud/overlay';
import { Renderer } from './render/renderer';
import type { GameView } from './render/view';
import { EraBanner, eraLine } from './ui/erabanner';

const ICON = { wood: '🪵', stone: '🪨', food: '🍎', water: '💧' } as const;

/**
 * Página do overlay (Fonte de navegador do OBS): só a vila, sem painel, com fundo transparente.
 * Não roda simulação: mostra o que o jogo do streamer transmite pelo Supabase.
 * Reproduz a câmera do streamer (zoom, giro, deslocamento), os nomes dos aldeões e o status da vila;
 * o que aparece (nomes, status) o streamer escolhe no painel do jogo.
 * Parâmetros: ?overlay=TOKEN  &fundo=1 (fundo sólido)  &2d (visual 2D)
 */
export async function runOverlay(
  token: string,
  makeViewer: (token: string, h: ViewerHandlers) => { start(): Promise<void> } = (t, h) => new OverlayViewer(t, h),
): Promise<void> {
  document.body.classList.add('overlay');
  const params = new URLSearchParams(location.search);
  const solid = params.has('fundo');
  if (!solid) document.documentElement.classList.add('clear');
  let canvas = document.getElementById('game') as HTMLCanvasElement;
  const msg = document.createElement('div');
  msg.id = 'overlaymsg';
  document.getElementById('stage')!.appendChild(msg);
  const say = (t: string): void => { msg.textContent = t; msg.hidden = !t; };

  if (!isValidToken(token)) { say('Link do overlay inválido. Copie de novo no painel do jogo.'); return; }

  let mirror: OverlayMirror | null = null;
  let eraBanner: EraBanner | null = null;
  let view: GameView | null = null;
  let lastFrame = 0;

  // status da vila (HUD): só dados públicos da live
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.hidden = true;
  document.getElementById('stage')!.appendChild(hud);
  let hudText = '';
  const drawHud = (m: OverlayMirror): void => {
    hud.hidden = !m.options.hud;
    if (hud.hidden) return;
    const w = m.world!, se = w.season;
    const days = Math.max(1, Math.ceil(se.daysLeft));
    const html = `<div class="hudera">${eraLine(w)}</div><div class="hudtop"><b>Dia ${w.day}</b><span class="${se.drought ? 'drought' : ''}">${se.drought ? `🔥 Seca · o rio volta em ${days}d` : `☀ Temperada · seca em ${days}d`}</span></div>`
      + `<div class="hudres">${RESOURCES.map((r) => `<span>${ICON[r]} ${Math.floor(w.stock[r])}</span>`).join('')}</div>`
      + `<div class="hudpop">👥 ${w.villagers.length}/${w.popCap}${w.waitlist.length ? ` (+${w.waitlist.length} na fila)` : ''}${w.supportActive ? ' · ✨ apoio' : ''}${w.starving ? ' · ⚠ fome/sede!' : ''}</div>`;
    if (html !== hudText) { hudText = html; hud.innerHTML = html; }
  };

  // câmera: acompanha a do streamer; quem mexeu por último manda (útil para testar o link numa aba comum)
  let cam: number[] | null = null; // câmera mostrada
  let goal: number[] | null = null; // para onde ela vai
  let lastHost: CameraArr | null = null;
  const fromView = (): void => {
    const c = view?.getCamera?.();
    if (c) { cam = goal = [c.yaw, c.pitch, c.dist, c.tx, c.ty, c.tz]; }
  };
  const hostMoved = (t: CameraArr): boolean => !lastHost || t.some((n, i) => Math.abs(n - lastHost![i]) > 0.002);

  // controles locais (no OBS a fonte não recebe mouse, então só valem numa aba normal)
  const stage = document.getElementById('stage')!;
  const local = (x: number, y: number): { x: number; y: number } => { const r = stage.getBoundingClientRect(); return { x: x - r.left, y: y - r.top }; };
  stage.addEventListener('wheel', (e) => {
    if (!view) return;
    e.preventDefault();
    const p = local(e.clientX, e.clientY);
    view.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
    fromView();
  }, { passive: false });
  let drag: { x: number; y: number } | null = null;
  stage.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointerup', () => { drag = null; });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || !view) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag = { x: e.clientX, y: e.clientY };
    if (e.buttons & 4 || e.buttons & 2) view.rotateBy?.(dx); else view.panBy(dx, dy);
    fromView();
  });
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (!view) return;
    if (e.key === 'q' || e.key === 'Q') { view.rotateBy?.(-130); fromView(); }
    if (e.key === 'e' || e.key === 'E') { view.rotateBy?.(130); fromView(); }
  });

  const startView = async (m: OverlayMirror): Promise<void> => {
    if (!params.has('2d')) {
      try {
        const { Renderer3D } = await import('./render/renderer3d');
        view = new Renderer3D(canvas, m.world!, { transparent: !solid });
        return;
      } catch (err) {
        console.warn('3D indisponível no overlay, usando 2D.', err);
        const fresh = canvas.cloneNode(false) as HTMLCanvasElement;
        canvas.replaceWith(fresh);
        canvas = fresh;
      }
    }
    view = new Renderer(canvas, m.world!);
  };

  const viewer = makeViewer(token, {
    onKey: (save) => {
      lastFrame = performance.now();
      if (!mirror) {
        mirror = OverlayMirror.fromKeyframe(save);
        eraBanner = new EraBanner(mirror.world!, document.getElementById('stage')!);
        void startView(mirror).then(() => { say(''); requestAnimationFrame(frame); });
      } else mirror.applyKeyframe(save);
    },
    onLight: (f) => { lastFrame = performance.now(); mirror?.applyLight(f); },
    onStatus: (s, detail) => {
      if (s === 'error') say(detail ?? 'Erro de conexão.');
      else if (s === 'connecting') say('Conectando…');
      else if (s === 'waiting' && !mirror) say('Aguardando o jogo do streamer…');
    },
  });
  void viewer.start();
  // gancho para testes no navegador / depuração
  (window as unknown as { __vilaOverlay: unknown }).__vilaOverlay = { get view() { return view; }, get mirror() { return mirror; } };

  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (mirror && view) {
      if (view.setCamera && mirror.camera) {
        const t: CameraArr = mirror.camera;
        if (hostMoved(t)) { goal = [...t]; if (!cam) cam = [...t]; lastHost = [...t]; }
      }
      if (view.setCamera && cam && goal) {
        const k = 1 - Math.exp(-dt * 10);
        cam = cam.map((c, i) => c + (goal![i] - c) * k);
        view.setCamera({ yaw: cam[0], pitch: cam[1], dist: cam[2], tx: cam[3], ty: cam[4], tz: cam[5] });
      }
      view.setNames?.(mirror.options.names);
      drawHud(mirror);
      eraBanner?.update();
      view.draw();
      say(now - lastFrame > 15000 ? 'Sem sinal do jogo do streamer…' : '');
    }
    requestAnimationFrame(frame);
  }
}
