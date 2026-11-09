import { describe, expect, it } from 'vitest';
import { normalizeChannel, toChatMessage, TwitchChat, type TmiLike } from '../src/chat/twitch';
import type { ChatMessage } from '../src/chat/commands';

class FakeTmi implements TmiLike {
  handlers: Record<string, (...a: any[]) => void> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  connected = false;
  failConnect = false;
  on(e: string, fn: (...a: any[]) => void): void { this.handlers[e] = fn; } // eslint-disable-line @typescript-eslint/no-explicit-any
  async connect(): Promise<void> { if (this.failConnect) throw new Error('boom'); this.connected = true; }
  async disconnect(): Promise<void> { this.connected = false; }
}

describe('canal', () => {
  it('normaliza formatos comuns', () => {
    expect(normalizeChannel(' #MeuCanal ')).toBe('meucanal');
    expect(normalizeChannel('https://www.twitch.tv/Japa_01/')).toBe('japa_01');
    expect(normalizeChannel('twitch.tv/abc?x=1')).toBe('abc');
  });
  it('recusa nomes inválidos', () => {
    for (const bad of ['', 'ab', 'a b c', 'canal!', 'x'.repeat(26)]) expect(normalizeChannel(bad)).toBeNull();
  });
});

describe('mensagem', () => {
  it('usa o ID da Twitch e o nome de exibição', () => {
    expect(toChatMessage({ username: 'ana', 'display-name': 'Ana', 'user-id': '42' }, '!entrar')).toEqual({ userId: '42', user: 'Ana', text: '!entrar' });
  });
  it('cai no login sem ID nem nome de exibição, e ignora sem login', () => {
    expect(toChatMessage({ username: 'ana' }, '!vila')).toEqual({ userId: 'ana', user: 'ana', text: '!vila' });
    expect(toChatMessage({}, '!vila')).toBeNull();
  });
});

describe('TwitchChat', () => {
  const setup = (fake = new FakeTmi()) => {
    const got: ChatMessage[] = [];
    const statuses: string[] = [];
    const chat = new TwitchChat((m) => got.push(m), (s) => statuses.push(s), async () => fake);
    return { fake, got, statuses, chat };
  };

  it('conecta e só repassa comandos', async () => {
    const { fake, got, chat } = setup();
    expect(await chat.connect('#canal')).toBe(true);
    expect(chat.status).toBe('connected');
    fake.handlers.message('#canal', { username: 'ana', 'user-id': '1' }, '!entrar', false);
    fake.handlers.message('#canal', { username: 'ana', 'user-id': '1' }, 'oi pessoal', false);
    fake.handlers.message('#canal', { username: 'bot', 'user-id': '2' }, '!vila', true);
    expect(got.map((m) => m.text)).toEqual(['!entrar']);
  });

  it('para de repassar depois de desconectar', async () => {
    const { fake, got, chat } = setup();
    await chat.connect('canal');
    await chat.disconnect();
    fake.handlers.message('#canal', { username: 'ana' }, '!entrar', false);
    expect(got).toHaveLength(0);
    expect(chat.status).toBe('disconnected');
  });

  it('informa erro de conexão e de canal inválido', async () => {
    const fake = new FakeTmi();
    fake.failConnect = true;
    const a = setup(fake);
    expect(await a.chat.connect('canal')).toBe(false);
    expect(a.chat.status).toBe('error');
    const b = setup();
    expect(await b.chat.connect('x')).toBe(false);
    expect(b.chat.status).toBe('error');
  });
});
