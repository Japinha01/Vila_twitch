import type { ChatMessage } from './commands';

export type TwitchStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Parte do cliente tmi.js que usamos (permite trocar por um falso nos testes). */
export interface TmiLike {
  on(event: string, fn: (...args: any[]) => void): unknown; // eslint-disable-line @typescript-eslint/no-explicit-any
  connect(): Promise<unknown>;
  disconnect(): Promise<unknown>;
}
export type TmiFactory = (channel: string) => Promise<TmiLike>;

/** Aceita "canal", "#canal" ou "twitch.tv/canal"; devolve o login em minúsculas ou null se for inválido. */
export function normalizeChannel(input: string): string | null {
  const t = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^(www\.)?twitch\.tv\//, '').replace(/^#/, '').split(/[/?]/)[0];
  return /^[a-z0-9_]{3,25}$/.test(t) ? t : null;
}

/** Converte uma mensagem do tmi.js no formato do pipeline. O ID numérico da Twitch é a identidade estável do viewer. */
export function toChatMessage(tags: Record<string, string | undefined>, text: string): ChatMessage | null {
  const login = tags.username;
  if (!login) return null;
  return { userId: tags['user-id'] ?? login, user: tags['display-name'] || login, text };
}

/** Leitura do chat da Twitch em modo anônimo (somente leitura: sem login, sem token). */
export class TwitchChat {
  status: TwitchStatus = 'disconnected';
  channel: string | null = null;
  private client: TmiLike | null = null;
  private run = 0; // invalida callbacks de conexões antigas

  constructor(
    private submit: (msg: ChatMessage) => void,
    private onStatus: (s: TwitchStatus, detail?: string) => void = () => {},
    private factory: TmiFactory = defaultFactory,
  ) {}

  async connect(rawChannel: string): Promise<boolean> {
    const channel = normalizeChannel(rawChannel);
    if (!channel) { this.set('error', 'Nome de canal inválido (use só letras, números e _).'); return false; }
    await this.disconnect();
    const run = ++this.run;
    this.channel = channel;
    this.set('connecting', channel);
    try {
      const client = await this.factory(channel);
      if (run !== this.run) return false;
      client.on('message', (_c: string, tags: Record<string, string | undefined>, text: string, self: boolean) => {
        if (run !== this.run || self || typeof text !== 'string') return;
        if (!text.startsWith('!')) return; // só comandos entram; conversa comum é ignorada
        const msg = toChatMessage(tags, text);
        if (msg) this.submit(msg);
      });
      client.on('disconnected', (reason: string) => { if (run === this.run) this.set('error', `Conexão perdida (${reason}). Tentando reconectar…`); });
      client.on('connected', () => { if (run === this.run) this.set('connected', channel); }); // volta sozinho após queda
      this.client = client;
      await client.connect();
      if (run !== this.run) { void client.disconnect().catch(() => {}); return false; }
      this.set('connected', channel);
      return true;
    } catch (err) {
      if (run !== this.run) return false;
      const dead = this.client;
      this.client = null;
      if (dead) void dead.disconnect().catch(() => {}); // para as tentativas automáticas
      this.set('error', `Não foi possível conectar: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.run++;
    const c = this.client;
    this.client = null;
    if (c) { try { await c.disconnect(); } catch { /* já estava fechado */ } }
    if (this.status !== 'disconnected') this.set('disconnected');
  }

  private set(s: TwitchStatus, detail?: string): void {
    if (s === this.status && s !== 'connecting') return; // não repete aviso (a reconexão automática dispara vários)
    this.status = s;
    this.onStatus(s, detail);
  }
}

/** Carrega o tmi.js só quando alguém conecta (fica fora do pacote inicial). */
const defaultFactory: TmiFactory = async (channel) => {
  const tmi = (await import('tmi.js')).default;
  return new tmi.Client({ channels: [channel], options: { skipUpdatingEmotesets: true }, connection: { reconnect: true, secure: true } }) as unknown as TmiLike;
};
