/**
 * Visual do aldeão (M6). Puramente cosmético: nada aqui muda a simulação.
 * O padrão vem do ID (sempre o mesmo para o mesmo viewer); o viewer personaliza pelo chat e o que ele escolhe
 * guarda-se no perfil. Chapéus e molduras se desbloqueiam com XP (o XP é do viewer, vale em qualquer vila onde ele jogue).
 */
export interface Named { id: string; label: string; color: string }

export const SKINS: Named[] = [
  { id: 'clara', label: 'clara', color: '#ffe0bd' }, { id: 'bege', label: 'bege', color: '#f1c27d' }, { id: 'morena', label: 'morena', color: '#e0ac69' },
  { id: 'canela', label: 'canela', color: '#c68642' }, { id: 'escura', label: 'escura', color: '#8d5524' }, { id: 'ebano', label: 'ébano', color: '#6f4222' },
];
export const HAIRS: Named[] = [
  { id: 'preto', label: 'preto', color: '#2b1d12' }, { id: 'castanho', label: 'castanho', color: '#4a3020' }, { id: 'caramelo', label: 'caramelo', color: '#7a4a21' },
  { id: 'loiro', label: 'loiro', color: '#c9a14a' }, { id: 'branco', label: 'branco', color: '#d8d8d8' }, { id: 'ruivo', label: 'ruivo', color: '#a33a1f' },
  { id: 'noite', label: 'noite', color: '#16161a' }, { id: 'azul', label: 'azul', color: '#3b6fd8' }, { id: 'rosa', label: 'rosa', color: '#e86aa6' },
];
export const SHIRTS: Named[] = [
  { id: 'vermelho', label: 'vermelho', color: '#e03131' }, { id: 'laranja', label: 'laranja', color: '#f76707' }, { id: 'amarelo', label: 'amarelo', color: '#fcc419' },
  { id: 'verde', label: 'verde', color: '#2f9e44' }, { id: 'lima', label: 'lima', color: '#94d82d' }, { id: 'ciano', label: 'ciano', color: '#15aabf' },
  { id: 'azul', label: 'azul', color: '#1c7ed6' }, { id: 'roxo', label: 'roxo', color: '#7048e8' }, { id: 'rosa', label: 'rosa', color: '#e64980' },
  { id: 'marrom', label: 'marrom', color: '#8a5a2b' }, { id: 'branco', label: 'branco', color: '#f1f3f5' }, { id: 'preto', label: 'preto', color: '#343a40' },
];

export type HatId = 'bone' | 'palha' | 'cartola' | 'mago';
export type FrameId = 'bronze' | 'prata' | 'ouro' | 'neon';
export interface Unlockable { id: string; label: string; color: string; xp: number }
export const HATS: (Unlockable & { id: HatId })[] = [
  { id: 'bone', label: 'boné', color: '#d9480f', xp: 50 },
  { id: 'palha', label: 'chapéu de palha', color: '#e8c872', xp: 150 },
  { id: 'cartola', label: 'cartola', color: '#212529', xp: 400 },
  { id: 'mago', label: 'chapéu de mago', color: '#5f3dc4', xp: 900 },
];
export const FRAMES: (Unlockable & { id: FrameId })[] = [
  { id: 'bronze', label: 'moldura de bronze', color: '#cd7f32', xp: 200 },
  { id: 'prata', label: 'moldura de prata', color: '#ced4da', xp: 600 },
  { id: 'ouro', label: 'moldura de ouro', color: '#ffd43b', xp: 1500 },
  { id: 'neon', label: 'moldura neon', color: '#38d9a9', xp: 3000 },
];

/** Escolhas do viewer. Campo ausente = padrão gerado pelo ID. */
export interface Look { skin?: number; hair?: number; shirt?: number; hat?: HatId; frame?: FrameId }

export type LookPart = 'pele' | 'cabelo' | 'cor' | 'chapeu' | 'moldura';
export type LookResult = { ok: true; look: Look } | { ok: false; reason: 'unknown' | 'locked'; need?: number };

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const find = <T extends { id: string; label: string }>(list: T[], value: string): number => {
  const v = norm(value);
  return list.findIndex((o) => o.id === v || norm(o.label) === v);
};

/** Aplica uma escolha respeitando o que o XP desbloqueia; "nenhum"/"padrao" volta ao padrão da parte. */
export function applyLook(look: Look, part: LookPart, value: string, xp: number): LookResult {
  const next: Look = { ...look };
  const reset = ['nenhum', 'nenhuma', 'padrao', 'tirar'].includes(norm(value));
  switch (part) {
    case 'pele': { if (reset) delete next.skin; else { const i = find(SKINS, value); if (i < 0) return { ok: false, reason: 'unknown' }; next.skin = i; } break; }
    case 'cabelo': { if (reset) delete next.hair; else { const i = find(HAIRS, value); if (i < 0) return { ok: false, reason: 'unknown' }; next.hair = i; } break; }
    case 'cor': { if (reset) delete next.shirt; else { const i = find(SHIRTS, value); if (i < 0) return { ok: false, reason: 'unknown' }; next.shirt = i; } break; }
    case 'chapeu': {
      if (reset) { delete next.hat; break; }
      const i = find(HATS, value);
      if (i < 0) return { ok: false, reason: 'unknown' };
      if (xp < HATS[i].xp) return { ok: false, reason: 'locked', need: HATS[i].xp - xp };
      next.hat = HATS[i].id;
      break;
    }
    case 'moldura': {
      if (reset) { delete next.frame; break; }
      const i = find(FRAMES, value);
      if (i < 0) return { ok: false, reason: 'unknown' };
      if (xp < FRAMES[i].xp) return { ok: false, reason: 'locked', need: FRAMES[i].xp - xp };
      next.frame = FRAMES[i].id;
      break;
    }
  }
  return { ok: true, look: next };
}

/** Limpa um visual vindo de fora (nuvem, save): índices e ids inválidos são descartados. */
export function sanitizeLook(raw: unknown): Look | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const idx = (v: unknown, n: number): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n ? v : undefined);
  const out: Look = {};
  const skin = idx(r.skin, SKINS.length), hair = idx(r.hair, HAIRS.length), shirt = idx(r.shirt, SHIRTS.length);
  if (skin !== undefined) out.skin = skin;
  if (hair !== undefined) out.hair = hair;
  if (shirt !== undefined) out.shirt = shirt;
  const hat = HATS.find((h) => h.id === r.hat);
  if (hat) out.hat = hat.id;
  const frame = FRAMES.find((f) => f.id === r.frame);
  if (frame) out.frame = frame.id;
  return Object.keys(out).length ? out : undefined;
}

/** Peças que o XP já liberou. */
export function unlockedFor(xp: number): { hats: string[]; frames: string[] } {
  return { hats: HATS.filter((h) => xp >= h.xp).map((h) => h.label), frames: FRAMES.filter((f) => xp >= f.xp).map((f) => f.label) };
}

/** O que realmente aparece na vila: chapéu e moldura só valem se o XP daquele viewer, ali, já os liberou. */
export function visibleLook(look: Look | undefined, xp: number): Look | undefined {
  if (!look) return look;
  const hat = HATS.find((h) => h.id === look.hat);
  const frame = FRAMES.find((f) => f.id === look.frame);
  if ((!hat || xp >= hat.xp) && (!frame || xp >= frame.xp)) return look;
  const out: Look = { ...look };
  if (hat && xp < hat.xp) delete out.hat;
  if (frame && xp < frame.xp) delete out.frame;
  return out;
}

/** ID da Twitch de um usuário do Supabase (só dígitos; vem da identidade de login). */
export function twitchIdOf(user: { identities?: { provider?: string; id?: string }[] | null; user_metadata?: Record<string, unknown> } | null | undefined): string | null {
  const fromIdentity = user?.identities?.find((i) => i.provider === 'twitch')?.id;
  const meta = user?.user_metadata ?? {};
  const raw = String(fromIdentity ?? meta.provider_id ?? meta.sub ?? '');
  return /^\d{1,20}$/.test(raw) ? raw : null;
}
