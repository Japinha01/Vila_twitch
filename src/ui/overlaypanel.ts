import { cloudConfigured } from '../cloud/client';
import { newOverlayToken, OverlayHost } from '../cloud/overlay';
import type { GameView } from '../render/view';
import type { CameraArr, OverlayOptions } from '../cloud/frames';
import type { World } from '../sim/world';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const TOKEN_KEY = 'vila-do-chat:overlay-token';
const ON_KEY = 'vila-do-chat:overlay-on';
const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null): void => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

/** Seção "Overlay para OBS" do painel: gera o link secreto e transmite a vila enquanto houver overlay aberto. */
export function initOverlayPanel(world: World, view: GameView, log: (t: string, c: 'ev') => void): void {
  if (!cloudConfigured()) return; // o overlay usa o Supabase Realtime
  $('overlay').hidden = false;
  const toggle = $<HTMLButtonElement>('ovtoggle'), copy = $<HTMLButtonElement>('ovcopy'), renew = $<HTMLButtonElement>('ovrenew');
  const url = $<HTMLInputElement>('ovurl'), status = $('ovstatus'), box = $('ovlink');
  let token = read(TOKEN_KEY);
  let host: OverlayHost | null = null;

  // o que o overlay mostra (escolha do streamer, lembrada no navegador)
  const names = $<HTMLInputElement>('ovnames'), hud = $<HTMLInputElement>('ovhud');
  names.checked = read('vila-do-chat:ov-nomes') !== '0';
  hud.checked = read('vila-do-chat:ov-status') !== '0';
  names.addEventListener('change', () => write('vila-do-chat:ov-nomes', names.checked ? '1' : '0'));
  hud.addEventListener('change', () => write('vila-do-chat:ov-status', hud.checked ? '1' : '0'));
  const extras = (): { c?: CameraArr; o: OverlayOptions } => {
    const c = view.getCamera?.();
    return { c: c ? [c.yaw, c.pitch, c.dist, c.tx, c.ty, c.tz] : undefined, o: { names: names.checked, hud: hud.checked } };
  };

  const link = (): string => `${location.origin}${location.pathname}?overlay=${token}`;
  const show = (text: string): void => { status.textContent = text; };

  const start = async (): Promise<void> => {
    token ??= newOverlayToken();
    write(TOKEN_KEY, token);
    write(ON_KEY, '1');
    url.value = link();
    box.hidden = false;
    toggle.textContent = 'Desativar overlay';
    show('conectando…');
    host = new OverlayHost(world, token, (viewers, error) => {
      if (error) show(`erro: ${error}`);
      else show(viewers ? `ligado · ${viewers} overlay${viewers > 1 ? 's' : ''} aberto${viewers > 1 ? 's' : ''}` : 'ligado · aguardando o OBS abrir o link');
    }, extras);
    if (!(await host.start())) { host = null; toggle.textContent = 'Ativar overlay'; box.hidden = true; write(ON_KEY, null); log('⚠ Não foi possível ativar o overlay.', 'ev'); }
    else show('ligado · aguardando o OBS abrir o link');
  };
  const stop = async (): Promise<void> => {
    write(ON_KEY, null);
    await host?.stop();
    host = null;
    toggle.textContent = 'Ativar overlay';
    box.hidden = true;
    show('desligado');
  };

  toggle.addEventListener('click', () => { void (host ? stop() : start()); });
  copy.addEventListener('click', () => {
    url.select();
    void navigator.clipboard?.writeText(url.value).then(() => log('📋 Link do overlay copiado.', 'ev'), () => { /* o campo já está selecionado: Ctrl+C */ });
  });
  renew.addEventListener('click', async () => {
    if (!window.confirm('Gerar um novo link? O link antigo para de funcionar e você precisa atualizá-lo no OBS.')) return;
    await host?.stop();
    token = newOverlayToken();
    host = null;
    await start();
  });
  window.addEventListener('beforeunload', () => { void host?.stop(); });
  if (read(ON_KEY) === '1' && token) void start(); // continua ligado depois de recarregar a página
}
