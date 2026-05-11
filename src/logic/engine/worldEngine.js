import { COLORS, TILE_H, TILE_W, WORLD_SIZE, Z_SCALE } from '../../data/gameData.js';

export const generateWorld = (size) => {
  const map = [];
  for (let x = 0; x <= size; x += 1) {
    map[x] = [];
    for (let y = 0; y <= size; y += 1) {
      const height = Math.sin(x * 0.1) * 2 + Math.cos(y * 0.08) * 2 + Math.sin((x + y) * 0.05) * 1.5 + 2;
      map[x][y] = Math.max(0, Math.floor(height));
    }
  }
  return map;
};

export const getCellZ = (heightMap, x, y, worldSize = WORLD_SIZE) => {
  if (x >= worldSize || y >= worldSize || x < 0 || y < 0) {
    return 0;
  }

  return (heightMap[x][y] + heightMap[x + 1][y] + heightMap[x][y + 1] + heightMap[x + 1][y + 1]) / 4;
};

export const toIso = (x, y, z) => ({
  cx: (x - y) * (TILE_W / 2),
  cy: (x + y) * (TILE_H / 2) - z * Z_SCALE,
});

export const getTerrainColor = (z) => {
  if (z < 1) return COLORS.water;
  if (z < 2) return COLORS.sand;
  if (z < 3.5) return COLORS.grass;
  if (z < 5) return COLORS.forest;
  if (z < 6.5) return COLORS.rock;
  return COLORS.snow;
};

export const generateEntities = (worldSize) => {
  const entities = [];
  entities.push({ id: 'v1', type: 'village', x: 10, y: 10, name: '风车镇', icon: '🏘️' });
  entities.push({ id: 'v2', type: 'shrine', x: 80, y: 75, name: '失落神殿', icon: '🏛️' });
  entities.push({ id: 'n1', type: 'npc', x: 12, y: 15, name: '流浪商人', icon: '🧙‍♂️', dialog: 'shop' });

  for (let index = 0; index < 30; index += 1) {
    entities.push({
      id: `e${index}`,
      type: 'enemy_patrol',
      icon: '👹',
      x: Math.floor(Math.random() * (worldSize - 10)) + 5,
      y: Math.floor(Math.random() * (worldSize - 10)) + 5,
      power: Math.floor(Math.random() * 3) + 1,
    });
  }

  return entities;
};

export const calculateMoveRange = ({
  startX,
  startY,
  moveRange,
  jumpPower,
  heightMap,
  entities = [],
  combatUnits = [],
  ignoreEntities = false,
  boundary = null,
  worldSize = WORLD_SIZE,
}) => {
  const visited = new Map();
  const queue = [{ x: startX, y: startY, dist: 0 }];
  const limits = boundary || { minX: 0, maxX: worldSize - 1, minY: 0, maxY: worldSize - 1 };
  visited.set(`${startX},${startY}`, 0);

  while (queue.length > 0) {
    const { x, y, dist } = queue.shift();
    if (dist >= moveRange) {
      continue;
    }

    const neighbors = [
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
    ];

    for (const neighbor of neighbors) {
      const nx = x + neighbor.dx;
      const ny = y + neighbor.dy;

      if (nx < limits.minX || nx > limits.maxX || ny < limits.minY || ny > limits.maxY) {
        continue;
      }

      const currentZ = getCellZ(heightMap, x, y, worldSize);
      const nextZ = getCellZ(heightMap, nx, ny, worldSize);
      if (Math.abs(nextZ - currentZ) > jumpPower) {
        continue;
      }

      if (heightMap[nx][ny] < 1) {
        continue;
      }

      if (!ignoreEntities) {
        if (entities.some((entity) => entity.x === nx && entity.y === ny)) {
          continue;
        }

        if (combatUnits.some((unit) => unit.x === nx && unit.y === ny && unit.hp > 0)) {
          continue;
        }
      }

      const key = `${nx},${ny}`;
      if (!visited.has(key) || visited.get(key) > dist + 1) {
        visited.set(key, dist + 1);
        queue.push({ x: nx, y: ny, dist: dist + 1 });
      }
    }
  }

  const cells = [];
  visited.forEach((_, key) => {
    const [x, y] = key.split(',').map(Number);
    cells.push({ x, y, type: 'move' });
  });
  return cells;
};