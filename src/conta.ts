import { Cloud } from './cloud/cloud';
import { World } from './sim/world';
import { hashString } from './sim/rng';
import { FRAMES, HAIRS, HATS, SHIRTS, SKINS, applyLook, type Look, type LookPart } from './sim/looks';

const esc = (t: string): string => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Boneco de frente no canvas, só para o viewer ver o que está escolhendo (o jogo desenha o 3D). */
function drawAvatar(ctx: CanvasRenderingContext2D, look: Look, id: string): void {
  const h = hashString(id);
  const skin = SKINS[look.skin ?? h % 6].color;
  const hair = HAIRS[look.hair ?? (h >>> 5) % 7].color;
  const shirt = look.shirt !== undefined ? SHIRTS[look.shirt].color : World.colorFor(id);
  ctx.clearRect(0, 0, 220, 260);
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(110, 238, 54, 10, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#3a3f55'; ctx.fillRect(80, 170, 25, 62); ctx.fillRect(115, 170, 25, 62);
  ctx.fillStyle = shirt; ctx.beginPath(); ctx.moveTo(72, 100); ctx.lineTo(148, 100); ctx.lineTo(156, 176); ctx.lineTo(64, 176); ctx.closePath(); ctx.fill();
  ctx.fillStyle = skin; ctx.fillRect(52, 108, 16, 52); ctx.fillRect(152, 108, 16, 52);
  ctx.beginPath(); ctx.arc(110, 70, 36, 0, 7); ctx.fill();
  ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(110, 64, 38, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#222'; ctx.fillRect(97, 74, 7, 9); ctx.fillRect(117, 74, 7, 9);
  const hat = HATS.find((x) => x.id === look.hat);
  if (hat) {
    ctx.fillStyle = hat.color;
    if (hat.id === 'bone') { ctx.beginPath(); ctx.arc(110, 56, 38, Math.PI, 0); ctx.fill(); ctx.fillRect(110, 52, 52, 8); }
    if (hat.id === 'palha') { ctx.fillRect(58, 46, 104, 8); ctx.fillRect(82, 22, 56, 28); ctx.fillStyle = '#b4452c'; ctx.fillRect(82, 40, 56, 8); }
    if (hat.id === 'cartola') { ctx.fillRect(66, 44, 88, 8); ctx.fillRect(84, 0, 52, 46); ctx.fillStyle = '#c92a2a'; ctx.fillRect(84, 34, 52, 9); }
    if (hat.id === 'mago') { ctx.fillRect(60, 46, 100, 8); ctx.beginPath(); ctx.moveTo(110, -20); ctx.lineTo(150, 48); ctx.lineTo(70, 48); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ffd43b'; ctx.fillRect(76, 38, 68, 8); }
  }
}

/** Popup que some sozinho: confirma o salvamento (ou mostra o erro) sem o viewer ter que procurar o aviso na página. */
function popup(text: string, ok: boolean): void {
  document.getElementById('contapop')?.remove();
  const el = document.createElement('div');
  el.id = 'contapop';
  el.className = ok ? 'ok' : 'erro';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${ok ? '✔' : '⚠'}</span><div>${esc(text)}</div>`;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 4200);
}

/** Página `?conta`: o viewer entra com a Twitch e monta o visual, que vale em qualquer vila onde ele jogar. */
export async function runConta(): Promise<void> {
  const app = document.getElementById('app')!;
  document.title = 'Meu aldeão · Vila do Chat';
  app.className = 'conta';
  app.innerHTML = '<div class="conta-box"><h1>Meu aldeão</h1><p id="cstatus">Carregando…</p></div>';
  const box = app.querySelector('.conta-box') as HTMLElement;
  const say = (html: string): void => { (document.getElementById('cstatus') as HTMLElement).innerHTML = html; };

  let cloud: Cloud | null = null;
  try { cloud = await Cloud.create(); } catch { /* sem nuvem */ }
  if (!cloud) { say('A nuvem não está configurada neste site. Peça ao streamer.'); return; }
  const c = cloud;
  if (!c.session) {
    say('Entre com a sua conta da Twitch para escolher o visual. Só usamos o seu ID para saber quem você é, sem nenhuma permissão extra.');
    const b = document.createElement('button');
    b.textContent = 'Entrar com a Twitch';
    b.className = 'conta-main';
    b.addEventListener('click', () => { void c.signIn().catch((e) => say(`Falhou: ${esc(String(e?.message ?? e))}`)); });
    box.appendChild(b);
    return;
  }
  const id = c.twitchId;
  if (!id) { say('Não consegui ler o seu ID da Twitch. Saia e entre de novo.'); return; }

  let look: Look = {};
  try { look = (await c.loadMyLook()) ?? {}; } catch { say('O visual global ainda não foi ativado no Supabase (o streamer precisa rodar supabase/viewer_looks.sql).'); }
  say(`Conectado como <b>${esc(c.displayName)}</b>. Escolha e clique em Salvar: vale em qualquer vila onde você jogar.`);

  const wrap = document.createElement('div');
  wrap.className = 'conta-grid';
  wrap.innerHTML = '<canvas id="cavatar" width="220" height="260"></canvas><div id="copts"></div>';
  box.appendChild(wrap);
  const ctx = (document.getElementById('cavatar') as HTMLCanvasElement).getContext('2d')!;
  const opts = document.getElementById('copts')!;
  const redraw = (): void => drawAvatar(ctx, look, id);

  const groups: { part: LookPart; title: string; items: { id: string; label: string; color: string; xp?: number }[] }[] = [
    { part: 'cor', title: 'Camisa', items: SHIRTS }, { part: 'cabelo', title: 'Cabelo', items: HAIRS }, { part: 'pele', title: 'Pele', items: SKINS },
    { part: 'chapeu', title: 'Chapéu (precisa de XP na vila)', items: HATS }, { part: 'moldura', title: 'Moldura do nome (precisa de XP na vila)', items: FRAMES },
  ];
  for (const g of groups) {
    const row = document.createElement('div');
    row.className = 'conta-row';
    row.innerHTML = `<h3>${g.title}</h3>`;
    const list = document.createElement('div');
    list.className = 'conta-sw';
    const mk = (label: string, color: string | null, value: string, xp?: number): void => {
      const b = document.createElement('button');
      b.title = xp ? `${label} · ${xp} XP` : label;
      b.innerHTML = color ? `<i style="background:${color}"></i>${xp ? `<small>${label}<br>${xp} XP</small>` : ''}` : '<small>padrão</small>';
      b.addEventListener('click', () => {
        const r = applyLook(look, g.part, value, 1e9); // aqui não há trava: quem confere o XP é a vila
        if (r.ok) { look = r.look; redraw(); }
      });
      list.appendChild(b);
    };
    mk('padrão', null, 'padrao');
    for (const it of g.items) mk(it.label, it.color, it.id, (it as { xp?: number }).xp);
    row.appendChild(list);
    opts.appendChild(row);
  }
  const save = document.createElement('button');
  save.textContent = '💾 Salvar visual';
  save.className = 'conta-main';
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      await c.saveMyLook(look);
      say('Salvo! Seu aldeão já aparece assim nas vilas (pode levar até um minuto).');
      popup('Visual salvo! Seu aldeão já aparece assim nas vilas.', true);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      say(`Não foi possível salvar: ${esc(msg)}`);
      popup(`Não foi possível salvar: ${msg}`, false);
    }
    save.disabled = false;
  });
  const out = document.createElement('button');
  out.textContent = 'Sair';
  out.addEventListener('click', () => { void c.signOut().then(() => location.reload()); });
  opts.append(save, ' ', out);
  redraw();
}
