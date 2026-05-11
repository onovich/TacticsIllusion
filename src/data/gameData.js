export const WORLD_SIZE = 100;
export const TILE_W = 60;
export const TILE_H = 30;
export const Z_SCALE = 15;

export const COLORS = {
  water: '#0ea5e9',
  sand: '#fcd34d',
  grass: '#4ade80',
  forest: '#16a34a',
  rock: '#9ca3af',
  snow: '#f8fafc',
  highlightMove: 'rgba(59, 130, 246, 0.55)',
  highlightAttack: 'rgba(239, 68, 68, 0.55)',
  combatBoundary: 'rgba(234, 179, 8, 0.3)',
  exploreMove: 'rgba(255, 255, 255, 0.3)',
};

export const JOBS = {
  Knight: { name: '皇家骑士', move: 4, jump: 1, range: 1, baseAtk: 25, baseHp: 120, icon: '⚔️', color: '#3b82f6', weapon: '宽刃剑' },
  Archer: { name: '游侠', move: 3, jump: 3, range: 4, baseAtk: 15, baseHp: 80, icon: '🏹', color: '#10b981', weapon: '长弓' },
  Mage: { name: '秘术师', move: 3, jump: 1, range: 3, baseAtk: 35, baseHp: 60, icon: '🪄', color: '#8b5cf6', weapon: '贤者杖', aoe: 1 },
};

export const GEMS = {
  ruby: {
    id: 'ruby',
    name: '力量红宝石',
    desc: '攻击力 +10',
    icon: '🔴',
    effect: (stats) => ({ ...stats, atk: stats.atk + 10 }),
  },
  emerald: {
    id: 'emerald',
    name: '生命绿宝石',
    desc: '最大生命 +30',
    icon: '🟢',
    effect: (stats) => ({ ...stats, maxHp: stats.maxHp + 30 }),
  },
};

export const createInitialPlayerData = () => ({
  gold: 200,
  exp: 0,
  level: 1,
  potions: 3,
  bombs: 1,
  inventory: { ruby: 1, emerald: 1 },
  party: [
    { id: 'p1', job: 'Knight', level: 1, hp: 120, maxHp: 120, enchantSlots: [null, null] },
    { id: 'p2', job: 'Archer', level: 1, hp: 80, maxHp: 80, enchantSlots: [null, null] },
    { id: 'p3', job: 'Mage', level: 1, hp: 60, maxHp: 60, enchantSlots: [null, null] },
  ],
  pos: { x: 8, y: 8 },
});