import { describe, expect, it } from 'vitest';
import { parseVillageRanks, parseViewerRanks, toViewerRankRows, toVillageRankRow, villageScore, RANK_VIEWERS_PER_VILLAGE } from '../src/cloud/ranking';
import type { AchStats } from '../src/sim/achievements';

const stats: AchStats = { pop: 20, era: 2, day: 10, built: 12, kinds: 5, couples: 0, kids: 0, drains: 0, demolished: 0, maxXp: 0, events: 0, professions: 0 };

describe('ranking na nuvem', () => {
  it('pontua a vila', () => {
    expect(villageScore(stats)).toBe(20 * 10 + 2 * 200 + 12 * 5 + 10);
  });
  it('nome do streamer passa pela blocklist e nunca fica vazio', () => {
    const row = toVillageRankRow('abc-123', '', stats, 3);
    expect(row.streamer.length).toBeGreaterThan(0);
    expect(row.score).toBe(villageScore(stats));
  });
  it('envia só IDs reais da Twitch, com XP, os melhores primeiro e com limite', () => {
    const m = new Map();
    for (let i = 1; i <= 40; i++) m.set(String(i), { name: `V${i}`, xp: i, job: 'wood' });
    m.set('sim:1', { name: 'Fake', xp: 999, job: 'wood' });
    m.set('99', { name: 'Zero', xp: 0, job: 'wood' });
    const rows = toViewerRankRows('o', 'Streamer', m);
    expect(rows).toHaveLength(RANK_VIEWERS_PER_VILLAGE);
    expect(rows[0].xp).toBe(40);
    expect(rows.some((r) => r.twitch_id === 'sim:1' || r.twitch_id === '99')).toBe(false);
  });
  it('descarta dado inválido ao ler', () => {
    expect(parseVillageRanks('x')).toEqual([]);
    expect(parseVillageRanks([{ streamer: 'Ana', pop: 1, era: 0, day: 1, score: 5 }, { streamer: 'Bad', pop: 'a' }])).toHaveLength(1);
    expect(parseViewerRanks([{ twitch_id: '1', name: 'Ana', streamer: 'Bia', xp: 10 }, { twitch_id: 2, xp: 1 }])).toHaveLength(1);
  });
});
