import { GEMS, JOBS, WORLD_SIZE } from '../../data/gameData.js';

export const getCombatUnitAt = (units, x, y) => units.find((unit) => unit.x === x && unit.y === y && unit.hp > 0);

const getCellKey = (x, y) => `${x},${y}`;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const FORMATION_MARGIN = 2;
const FORMATION_CROSS_MARGIN = 2;
const FORMATION_CROSS_OFFSETS = [0, -1, 1, -2, 2, -3, 3];

const getCombatFormation = ({ actualPlayerPos, enemyPos, boundary }) => {
  const dx = enemyPos.x - actualPlayerPos.x;
  const dy = enemyPos.y - actualPlayerPos.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);

  if (horizontal) {
    const playerAdvancesRight = dx >= 0;
    const centerY = clamp(
      Math.round((actualPlayerPos.y + enemyPos.y) / 2),
      boundary.minY + FORMATION_CROSS_MARGIN,
      boundary.maxY - FORMATION_CROSS_MARGIN,
    );

    return {
      horizontal,
      playerAnchor: {
        x: playerAdvancesRight ? boundary.minX + FORMATION_MARGIN : boundary.maxX - FORMATION_MARGIN,
        y: centerY,
      },
      enemyAnchor: {
        x: playerAdvancesRight ? boundary.maxX - FORMATION_MARGIN : boundary.minX + FORMATION_MARGIN,
        y: centerY,
      },
      playerInward: { x: playerAdvancesRight ? 1 : -1, y: 0 },
      enemyInward: { x: playerAdvancesRight ? -1 : 1, y: 0 },
    };
  }

  const playerAdvancesDown = dy >= 0;
  const centerX = clamp(
    Math.round((actualPlayerPos.x + enemyPos.x) / 2),
    boundary.minX + FORMATION_CROSS_MARGIN,
    boundary.maxX - FORMATION_CROSS_MARGIN,
  );

  return {
    horizontal,
    playerAnchor: {
      x: centerX,
      y: playerAdvancesDown ? boundary.minY + FORMATION_MARGIN : boundary.maxY - FORMATION_MARGIN,
    },
    enemyAnchor: {
      x: centerX,
      y: playerAdvancesDown ? boundary.maxY - FORMATION_MARGIN : boundary.minY + FORMATION_MARGIN,
    },
    playerInward: { x: 0, y: playerAdvancesDown ? 1 : -1 },
    enemyInward: { x: 0, y: playerAdvancesDown ? -1 : 1 },
  };
};

const getFormationOffset = ({ index, horizontal, inward }) => {
  const crossOffset = FORMATION_CROSS_OFFSETS[index % FORMATION_CROSS_OFFSETS.length];
  const depth = Math.floor(index / FORMATION_CROSS_OFFSETS.length);

  if (horizontal) {
    return {
      x: inward.x * depth,
      y: crossOffset,
    };
  }

  return {
    x: crossOffset,
    y: inward.y * depth,
  };
};

const createSearchOffsets = (maxDistance = 6) => {
  const offsets = [{ x: 0, y: 0 }];

  for (let distance = 1; distance <= maxDistance; distance += 1) {
    for (let dx = -distance; dx <= distance; dx += 1) {
      const dy = distance - Math.abs(dx);
      offsets.push({ x: dx, y: dy });
      if (dy !== 0) {
        offsets.push({ x: dx, y: -dy });
      }
    }
  }

  return offsets;
};

const SEARCH_OFFSETS = createSearchOffsets();

const isSpawnCellValid = ({ x, y, boundary, occupiedCells, heightMap }) => {
  if (x < boundary.minX || x > boundary.maxX || y < boundary.minY || y > boundary.maxY) {
    return false;
  }

  if (occupiedCells.has(getCellKey(x, y))) {
    return false;
  }

  if (heightMap && heightMap[x]?.[y] < 1) {
    return false;
  }

  return true;
};

const findSpawnCell = ({ anchorX, anchorY, boundary, occupiedCells, heightMap }) => {
  for (const offset of SEARCH_OFFSETS) {
    const x = anchorX + offset.x;
    const y = anchorY + offset.y;

    if (isSpawnCellValid({ x, y, boundary, occupiedCells, heightMap })) {
      return { x, y };
    }
  }

  for (let y = boundary.minY; y <= boundary.maxY; y += 1) {
    for (let x = boundary.minX; x <= boundary.maxX; x += 1) {
      if (isSpawnCellValid({ x, y, boundary, occupiedCells, heightMap })) {
        return { x, y };
      }
    }
  }

  return {
    x: clamp(anchorX, boundary.minX, boundary.maxX),
    y: clamp(anchorY, boundary.minY, boundary.maxY),
  };
};

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

export const createCombatState = ({ playerData, enemyEnt, actualPlayerPos, heightMap = null, worldSize = WORLD_SIZE }) => {
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
  const occupiedCells = new Set();
  const formation = getCombatFormation({
    actualPlayerPos,
    enemyPos: { x: ex, y: ey },
    boundary,
  });

  playerData.party.forEach((partyMember, index) => {
    const stats = calcUnitStats(partyMember);
    const formationOffset = getFormationOffset({
      index,
      horizontal: formation.horizontal,
      inward: formation.playerInward,
    });
    const spawn = findSpawnCell({
      anchorX: formation.playerAnchor.x + formationOffset.x,
      anchorY: formation.playerAnchor.y + formationOffset.y,
      boundary,
      occupiedCells,
      heightMap,
    });
    occupiedCells.add(getCellKey(spawn.x, spawn.y));

    combatUnits.push({
      ...partyMember,
      uid: `u_p_${index}`,
      team: 'player',
      x: spawn.x,
      y: spawn.y,
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
    const formationOffset = getFormationOffset({
      index,
      horizontal: formation.horizontal,
      inward: formation.enemyInward,
    });
    const spawn = findSpawnCell({
      anchorX: formation.enemyAnchor.x + formationOffset.x,
      anchorY: formation.enemyAnchor.y + formationOffset.y,
      boundary,
      occupiedCells,
      heightMap,
    });
    occupiedCells.add(getCellKey(spawn.x, spawn.y));

    combatUnits.push({
      ...enemyData,
      uid: `u_e_${index}`,
      team: 'enemy',
      x: spawn.x,
      y: spawn.y,
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