import { describe, expect, it } from 'vitest';
import { OverlayHost } from '../src/cloud/overlay';
import { World } from '../src/sim/world';

describe('câmera do overlay', () => {
  it('manda a câmera à parte só quando ela mexe (e um sinal por segundo parada)', () => {
    let cam = [0.5, 0.9, 20, 10, 0, 10];
    const host = new OverlayHost(new World(1), 'tok', () => {}, () => ({ c: cam as never }));
    const sent: { event: string; payload: { c: number[] } }[] = [];
    const priv = host as unknown as { ch: unknown; viewers: number; pumpCamera(): void };
    priv.ch = { send: (m: { event: string; payload: { c: number[] } }) => { sent.push(m); return Promise.resolve('ok'); } };
    priv.viewers = 1;
    priv.pumpCamera();
    priv.pumpCamera(); // parada: não repete
    expect(sent.length).toBe(1);
    expect(sent[0].event).toBe('cam');
    cam = [0.6, 0.9, 20, 10.4, 0, 10];
    priv.pumpCamera();
    expect(sent.length).toBe(2);
    expect(sent[1].payload.c[0]).toBe(0.6);
    priv.viewers = 0; // sem overlay aberto, nada é enviado
    cam = [1, 0.9, 20, 10, 0, 10];
    priv.pumpCamera();
    expect(sent.length).toBe(2);
  });
});
