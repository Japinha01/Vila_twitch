import { OverlayMirror } from './cloud/frames';
import { isValidToken, OverlayViewer } from './cloud/overlay';
import { Renderer } from './render/renderer';
import type { GameView } from './render/view';

/**
 * Página do overlay (Fonte de navegador do OBS): só a vila, sem painel, com fundo transparente.
 * Não roda simulação: mostra o que o jogo do streamer transmite pelo Supabase.
 * Parâmetros: ?overlay=TOKEN  &fundo=1 (fundo sólido)  &2d (visual 2D)
 */
export async function runOverlay(token: string): Promise<void> {
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
  let view: GameView | null = null;
  let lastFrame = 0;

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

  const viewer = new OverlayViewer(token, {
    onKey: (save) => {
      lastFrame = performance.now();
      if (!mirror) {
        mirror = OverlayMirror.fromKeyframe(save);
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

  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (mirror && view) {
      mirror.smooth(dt);
      view.draw();
      say(now - lastFrame > 15000 ? 'Sem sinal do jogo do streamer…' : '');
    }
    requestAnimationFrame(frame);
  }
}
