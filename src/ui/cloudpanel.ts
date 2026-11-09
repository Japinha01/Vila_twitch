import { Cloud } from '../cloud/cloud';
import type { World } from '../sim/world';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const ASKED = 'vila-do-chat:nuvem-perguntou';
const AUTOSAVE_MS = 60000;

interface Hooks {
  world: World;
  log: (text: string, cls: 'ev') => void;
  /** grava o save da nuvem no navegador e recarrega; devolve false se o save for inválido */
  loadCloudSave: (data: Parameters<typeof import('./save')['writeSave']>[0]) => boolean;
}

/** Seção "Nuvem" do painel: login com a Twitch (Supabase) e salvamento da vila e dos perfis. Fica oculta sem configuração. */
export async function initCloudPanel({ world, log, loadCloudSave }: Hooks): Promise<void> {
  let cloud: Cloud | null = null;
  try { cloud = await Cloud.create(); } catch (err) { console.warn('Nuvem indisponível', err); }
  if (!cloud) return; // sem VITE_SUPABASE_*: o jogo segue só com o save do navegador
  const c = cloud;
  $('cloud').hidden = false;
  const status = $('cloudstatus'), login = $<HTMLButtonElement>('cloudlogin'), saveBtn = $<HTMLButtonElement>('cloudsave');
  let auto = true;
  let failed = false;

  const render = (): void => {
    const on = !!c.session;
    status.textContent = on ? `conectado como ${c.displayName}` : 'sem login';
    login.textContent = on ? 'Sair' : 'Entrar com a Twitch';
    saveBtn.hidden = !on;
  };
  const save = async (manual: boolean): Promise<void> => {
    if (!c.session || (!auto && !manual)) return;
    try {
      await Promise.all([c.saveVillage(world.serialize(), world.day), c.saveProfiles(world.collectProfiles())]);
      failed = false;
      auto = true;
      if (manual) log('☁ Vila salva na nuvem.', 'ev');
    } catch (err) {
      if (manual || !failed) log(`⚠ Não foi possível salvar na nuvem: ${err instanceof Error ? err.message : 'erro desconhecido'}`, 'ev');
      failed = true; // avisa uma vez só até voltar a funcionar
    }
  };

  login.addEventListener('click', async () => {
    try {
      if (c.session) { await c.signOut(); render(); log('☁ Você saiu da conta.', 'ev'); } else await c.signIn();
    } catch (err) { log(`⚠ Login falhou: ${err instanceof Error ? err.message : 'erro desconhecido'}`, 'ev'); }
  });
  saveBtn.addEventListener('click', () => { void save(true); });
  render();

  if (c.session) {
    try {
      world.profiles = await c.loadProfiles();
      const remote = await c.loadVillage();
      if (!remote) {
        await save(true); // primeira vez: sobe a vila atual
      } else if (sessionStorage.getItem(ASKED) === 'manter') {
        auto = false; // já recusou a vila da nuvem nesta aba: não sobrescreve sozinho
      } else if (!sessionStorage.getItem(ASKED)) {
        sessionStorage.setItem(ASKED, 'carregou');
        const when = new Date(remote.updatedAt).toLocaleString('pt-BR');
        if (window.confirm(`Há uma vila salva na nuvem (dia ${remote.day}, salva em ${when}).\n\nOK: carregar a da nuvem (substitui a vila deste navegador).\nCancelar: manter esta vila (a da nuvem só será substituída se você clicar em "Salvar agora").`)) {
          if (loadCloudSave(remote.data)) return; // a página recarrega
          log('⚠ O save da nuvem está inválido ou de outra versão; mantendo esta vila.', 'ev');
        }
        sessionStorage.setItem(ASKED, 'manter');
        auto = false;
      }
      log(`☁ Conectado como ${c.displayName}. ${world.profiles.size} viewers com progresso guardado.`, 'ev');
    } catch (err) {
      log(`⚠ Falha ao ler a nuvem: ${err instanceof Error ? err.message : 'erro desconhecido'}`, 'ev');
      auto = false; // sem ler, não arrisca sobrescrever
    }
  }
  setInterval(() => { void save(false); }, AUTOSAVE_MS);
}
