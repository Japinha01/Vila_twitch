/** Números que a simulação entrega para avaliar as conquistas. */
export interface AchStats {
  pop: number;
  era: number;
  day: number;
  built: number;
  kinds: number; // tipos de prédio diferentes prontos
  couples: number;
  kids: number;
  drains: number;
  demolished: number;
  maxXp: number;
  events: number;
  professions: number; // profissões com líder
}

export interface AchievementDef { id: string; icon: string; label: string; desc: string; test: (s: AchStats) => boolean }

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'pop10', icon: '🏘', label: 'Povoado', desc: '10 aldeões na vila', test: (s) => s.pop >= 10 },
  { id: 'pop50', icon: '🌆', label: 'Cidadezinha', desc: '50 aldeões na vila', test: (s) => s.pop >= 50 },
  { id: 'pop150', icon: '🏙', label: 'Metrópole', desc: '150 aldeões na vila', test: (s) => s.pop >= 150 },
  { id: 'era2', icon: '🏛', label: 'Novos tempos', desc: 'Chegar à 2ª era', test: (s) => s.era >= 1 },
  { id: 'era5', icon: '⚙', label: 'Era industrial', desc: 'Chegar à 5ª era', test: (s) => s.era >= 4 },
  { id: 'era8', icon: '🚀', label: 'Futuro', desc: 'Chegar à última era', test: (s) => s.era >= 7 },
  { id: 'build20', icon: '🏗', label: 'Canteiro cheio', desc: '20 prédios prontos', test: (s) => s.built >= 20 },
  { id: 'kinds8', icon: '🧱', label: 'Variedade', desc: '8 tipos de prédio diferentes', test: (s) => s.kinds >= 8 },
  { id: 'day30', icon: '📅', label: 'Um mês', desc: 'Chegar ao dia 30', test: (s) => s.day >= 30 },
  { id: 'day100', icon: '🗓', label: 'Veteranos', desc: 'Chegar ao dia 100', test: (s) => s.day >= 100 },
  { id: 'couple', icon: '💞', label: 'Amor na vila', desc: 'Surgir o primeiro casal', test: (s) => s.couples >= 1 },
  { id: 'kid', icon: '👶', label: 'Berço', desc: 'Nascer a primeira criança', test: (s) => s.kids >= 1 },
  { id: 'drain', icon: '🕳', label: 'Engenheiros', desc: 'Cavar um canal de drenagem', test: (s) => s.drains >= 1 },
  { id: 'demolish', icon: '🧨', label: 'Tudo pelo bem comum', desc: 'Os aldeões demolirem um prédio alagado', test: (s) => s.demolished >= 1 },
  { id: 'xp500', icon: '⭐', label: 'Trabalhador exemplar', desc: 'Um aldeão chegar a 500 de XP', test: (s) => s.maxXp >= 500 },
  { id: 'events5', icon: '🎲', label: 'Vida agitada', desc: 'Passar por 5 eventos', test: (s) => s.events >= 5 },
  { id: 'jobs', icon: '👑', label: 'Todos com ofício', desc: 'Todas as profissões com um líder', test: (s) => s.professions >= 5 },
];
