import { GEMS, JOBS, WORLD_SIZE } from '../../data/gameData.js';

export const getCombatUnitAt = (units, x, y) => units.find((unit) => unit.x === x && unit.y === y && unit.hp > 0);

export const calcUnitStats = (unitData) => {
  const job = JOBS[unitData.job];
  let stats = {
    atk: job.baseAtk + (unitData.level - 1) * 5,
    maxHp: job.baseHp + (unitData.level - 1) * 15,
    move: job.move,
    jump: job.jump,
    range: job.range,
  };

  unitData.enchantSlots.forEach((gemId) => {
    if (gemId && GEMS[gemId]) {
      stats = GEMS[gemId].effect(stats);
    }
  });

  return stats;
};

export const createCombatState = ({ playerData, enemyEnt, actualPlayerPos, worldSize = WORLD_SIZE }) => {
  const px = actualPlayerPos.x;
  const py = actualPlayerPos.y;
  const ex = enemyEnt.x;
  const ey = enemyEnt.y;
  const centerX = Math.floor((px + ex) / 2);
  const centerY = Math.floor((py + ey) / 2);
  const boundary = {
    minX: Math.max(0, centerX - 6),
    maxX: Math.min(worldSize - 1, centerX + 7),
    minY: Math.max(0, centerY - 6),
    maxY: Math.min(worldSize - 1, centerY + 7),
  };

  const combatUnits = [];
  const playerPositions = [
    { x: px, y: py },
    { x: px - 1, y: py },
    { x: px, y: py - 1 },
  ];

  playerData.party.forEach((partyMember, index) => {
    const stats = calcUnitStats(partyMember);
    const spawn = playerPositions[index];
    combatUnits.push({
      ...partyMember,
      uid: `u_p_${index}`,
      team: 'player',
      x: Math.max(boundary.minX, Math.min(boundary.maxX, spawn.x)),
      y: Math.max(boundary.minY, Math.min(boundary.maxY, spawn.y)),
      hasMoved: false,
      hasActed: false,
      ...stats,
    });
  });

  const enemyCount = enemyEnt.power + 1;
  for (let index = 0; index < enemyCount; index += 1) {
    const isMage = Math.random() > 0.7;
    const job = isMage ? 'Mage' : Math.random() > 0.5 ? 'Knight' : 'Archer';
    const enemyData = {
      job,
      level: playerData.level + (Math.random() > 0.8 ? 1 : 0),
      enchantSlots: [],
    };
    const stats = calcUnitStats(enemyData);
    combatUnits.push({
      ...enemyData,
      uid: `u_e_${index}`,
      team: 'enemy',
      x: Math.max(boundary.minX, Math.min(boundary.maxX, ex + Math.floor(Math.random() * 3) - 1)),
      y: Math.max(boundary.minY, Math.min(boundary.maxY, ey + Math.floor(Math.random() * 3) - 1)),
      hp: stats.maxHp,
      hasMoved: false,
      hasActed: false,
      ...stats,
    });
  }

  return {
    enemyEntId: enemyEnt.id,
    boundary,
    units: combatUnits,
    turn: 'player',
    selectedUnit: null,
    actionState: 'idle',
    hlCells: [],
  };
};