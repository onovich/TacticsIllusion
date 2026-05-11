import React, { useState, useEffect, useRef } from 'react';

// --- 配置与常量 ---
const WORLD_SIZE = 100; 
const TILE_W = 60;
const TILE_H = 30;
const Z_SCALE = 15;
const COLORS = {
  water: '#0ea5e9', sand: '#fcd34d', grass: '#4ade80', forest: '#16a34a',
  rock: '#9ca3af', snow: '#f8fafc',
  highlightMove: 'rgba(59, 130, 246, 0.55)', highlightAttack: 'rgba(239, 68, 68, 0.55)',
  combatBoundary: 'rgba(234, 179, 8, 0.3)',
  exploreMove: 'rgba(255, 255, 255, 0.3)' 
};

const JOBS = {
  Knight: { name: '皇家骑士', move: 4, jump: 1, range: 1, baseAtk: 25, baseHp: 120, icon: '⚔️', color: '#3b82f6', weapon: '宽刃剑' },
  Archer: { name: '游侠', move: 3, jump: 3, range: 4, baseAtk: 15, baseHp: 80, icon: '🏹', color: '#10b981', weapon: '长弓' },
  Mage: { name: '秘术师', move: 3, jump: 1, range: 3, baseAtk: 35, baseHp: 60, icon: '🪄', color: '#8b5cf6', weapon: '贤者杖', aoe: 1 },
};

const GEMS = {
  ruby: { id: 'ruby', name: '力量红宝石', desc: '攻击力 +10', icon: '🔴', effect: (stats) => ({...stats, atk: stats.atk + 10}) },
  emerald: { id: 'emerald', name: '生命绿宝石', desc: '最大生命 +30', icon: '🟢', effect: (stats) => ({...stats, maxHp: stats.maxHp + 30}) },
};

// --- 工具函数 ---
const generateWorld = (size) => {
  const map = [];
  for (let x = 0; x <= size; x++) {
    map[x] = [];
    for (let y = 0; y <= size; y++) {
      let z = Math.sin(x * 0.1) * 2 + Math.cos(y * 0.08) * 2 + Math.sin((x + y) * 0.05) * 1.5 + 2;
      map[x][y] = Math.max(0, Math.floor(z)); 
    }
  }
  return map;
};

const getCellZ = (hMap, x, y) => {
  if(x>=WORLD_SIZE || y>=WORLD_SIZE || x<0 || y<0) return 0;
  return (hMap[x][y] + hMap[x+1][y] + hMap[x][y+1] + hMap[x+1][y+1]) / 4;
}
const toIso = (x, y, z) => ({ cx: (x - y) * (TILE_W / 2), cy: (x + y) * (TILE_H / 2) - (z * Z_SCALE) });
const getTerrainColor = (z) => {
  if (z < 1) return COLORS.water; if (z < 2) return COLORS.sand;
  if (z < 3.5) return COLORS.grass; if (z < 5) return COLORS.forest;
  if (z < 6.5) return COLORS.rock; return COLORS.snow;
};

const generateEntities = (worldSize) => {
  const ents = [];
  ents.push({ id: 'v1', type: 'village', x: 10, y: 10, name: '风车镇', icon: '🏘️' });
  ents.push({ id: 'v2', type: 'shrine', x: 80, y: 75, name: '失落神殿', icon: '🏛️' });
  ents.push({ id: 'n1', type: 'npc', x: 12, y: 15, name: '流浪商人', icon: '🧙‍♂️', dialog: 'shop' });
  
  for (let i = 0; i < 30; i++) {
    ents.push({
      id: `e${i}`, type: 'enemy_patrol', icon: '👹',
      x: Math.floor(Math.random() * (worldSize-10)) + 5,
      y: Math.floor(Math.random() * (worldSize-10)) + 5,
      power: Math.floor(Math.random() * 3) + 1
    });
  }
  return ents;
};


export default function App() {
  const canvasRef = useRef(null);
  
  // ================= 核心状态 =================
  const [mode, setMode] = useState('EXPLORE'); 
  const [playerData, setPlayerData] = useState({
    gold: 200, exp: 0, level: 1, potions: 3, bombs: 1, inventory: { ruby: 1, emerald: 1 }, 
    party: [
      { id: 'p1', job: 'Knight', level: 1, hp: 120, maxHp: 120, enchantSlots: [null, null] },
      { id: 'p2', job: 'Archer', level: 1, hp: 80, maxHp: 80, enchantSlots: [null, null] },
      { id: 'p3', job: 'Mage', level: 1, hp: 60, maxHp: 60, enchantSlots: [null, null] },
    ], pos: { x: 8, y: 8 } 
  });
  const [worldMap] = useState(() => generateWorld(WORLD_SIZE));
  const [entities, setEntities] = useState(() => generateEntities(WORLD_SIZE));
  const [dialogData, setDialogData] = useState(null);
  const [exploreState, setExploreState] = useState({ isSelected: false, hlCells: [] });
  const [combatState, setCombatState] = useState(null); 

  // 高性能引用库
  const cameraRef = useRef({ x: 0, y: 200, zoom: 1 });
  const floatingTextsRef = useRef([]);
  const renderablesRef = useRef([]); 
  const stateRef = useRef({ mode, playerData, entities, combatState, exploreState });

  useEffect(() => {
    stateRef.current = { mode, playerData, entities, combatState, exploreState };
  }, [mode, playerData, entities, combatState, exploreState]);

  useEffect(() => {
    const p = playerData.pos;
    const pos = toIso(p.x, p.y, getCellZ(worldMap, p.x, p.y));
    cameraRef.current.x = -pos.cx; cameraRef.current.y = -pos.cy + 100;
  }, []);

  // ================= BFS寻路 =================
  const calculateMoveRange = (startX, startY, moveRange, jumpPower, ignoreEntities = false, boundary = null) => {
    const st = stateRef.current;
    const visited = new Map();
    const queue = [{ x: startX, y: startY, dist: 0 }];
    visited.set(`${startX},${startY}`, 0);
    const b = boundary || { minX: 0, maxX: WORLD_SIZE-1, minY: 0, maxY: WORLD_SIZE-1 };

    while (queue.length > 0) {
      const { x, y, dist } = queue.shift();
      if (dist >= moveRange) continue;
      const neighbors = [ {dx: 0, dy: -1}, {dx: 1, dy: 0}, {dx: 0, dy: 1}, {dx: -1, dy: 0} ];
      for (let n of neighbors) {
        const nx = x + n.dx; const ny = y + n.dy;
        if (nx >= b.minX && nx <= b.maxX && ny >= b.minY && ny <= b.maxY) {
          const currentZ = getCellZ(worldMap, x, y); const nextZ = getCellZ(worldMap, nx, ny);
          if (Math.abs(nextZ - currentZ) > jumpPower) continue; 
          if (worldMap[nx][ny] < 1) continue; 

          if (!ignoreEntities) {
            if (st.entities.find(e => e.x === nx && e.y === ny)) continue;
            if (st.mode === 'COMBAT' && getCombatUnitAt(st.combatState.units, nx, ny)) continue;
          }

          const key = `${nx},${ny}`;
          if (!visited.has(key) || visited.get(key) > dist + 1) {
            visited.set(key, dist + 1); queue.push({ x: nx, y: ny, dist: dist + 1 });
          }
        }
      }
    }
    const cells = [];
    visited.forEach((_, key) => { cells.push({ x: parseInt(key.split(',')[0]), y: parseInt(key.split(',')[1]), type: 'move' }); });
    return cells;
  };

  // ================= 游戏交互逻辑 =================
  const handleExploreGridClick = (tx, ty) => {
    const st = stateRef.current; const p = st.playerData.pos; const expState = st.exploreState;
    if (tx === p.x && ty === p.y) {
      if (expState.isSelected) setExploreState({ isSelected: false, hlCells: [] });
      else setExploreState({ isSelected: true, hlCells: calculateMoveRange(p.x, p.y, 10, 2, true) });
      return;
    }
    if (expState.isSelected) {
      const canMoveTo = expState.hlCells.find(c => c.x === tx && c.y === ty);
      const hitEntity = st.entities.find(e => e.x === tx && e.y === ty);
      if (hitEntity) {
        if (canMoveTo || Math.abs(tx - p.x) + Math.abs(ty - p.y) <= 1) {
          interactWithEntity(hitEntity, tx, ty); setExploreState({ isSelected: false, hlCells: [] });
        }
      } else if (canMoveTo) {
        setPlayerData(prev => ({ ...prev, pos: { x: tx, y: ty } }));
        setExploreState({ isSelected: false, hlCells: [] });
        const targetPos = toIso(tx, ty, getCellZ(worldMap, tx, ty));
        cameraRef.current.x = -targetPos.cx; cameraRef.current.y = -targetPos.cy + 100;
      } else {
        setExploreState({ isSelected: false, hlCells: [] });
      }
    }
  };

  const interactWithEntity = (ent, entX, entY) => {
    const st = stateRef.current; const p = st.playerData.pos;
    let newPos = { x: p.x, y: p.y };
    if (Math.abs(entX - p.x) + Math.abs(entY - p.y) > 1) {
       newPos = { x: entX, y: entY }; setPlayerData(prev => ({ ...prev, pos: newPos }));
    }
    if (ent.type === 'enemy_patrol') initCombat(ent, newPos);
    else if (ent.type === 'npc' || ent.type === 'village' || ent.type === 'shrine') {
      setMode('DIALOG');
      setDialogData({ name: ent.name, type: ent.type === 'npc' ? 'shop' : 'town', text: ent.type === 'npc' ? '冒险者，来看看我的好东西，童叟无欺。' : '村长：勇士，外面怪物横行，一定要小心。' });
    }
  };

  const calcUnitStats = (unitData) => {
    const job = JOBS[unitData.job];
    let stats = { atk: job.baseAtk + (unitData.level - 1) * 5, maxHp: job.baseHp + (unitData.level - 1) * 15, move: job.move, jump: job.jump, range: job.range };
    unitData.enchantSlots.forEach(gemId => { if (gemId && GEMS[gemId]) stats = GEMS[gemId].effect(stats); });
    return stats;
  };

  const initCombat = (enemyEnt, actualPlayerPos) => {
    const st = stateRef.current;
    const px = actualPlayerPos.x, py = actualPlayerPos.y, ex = enemyEnt.x, ey = enemyEnt.y;
    const centerX = Math.floor((px + ex) / 2), centerY = Math.floor((py + ey) / 2);
    const b = { minX: Math.max(0, centerX - 6), maxX: Math.min(WORLD_SIZE-1, centerX + 7), minY: Math.max(0, centerY - 6), maxY: Math.min(WORLD_SIZE-1, centerY + 7) };
    const combatUnits = [];
    const playerPositions = [ {x: px, y: py}, {x: px - 1, y: py}, {x: px, y: py - 1} ];

    st.playerData.party.forEach((pData, idx) => {
      const stats = calcUnitStats(pData);
      let spawnX = Math.max(b.minX, Math.min(b.maxX, playerPositions[idx].x)), spawnY = Math.max(b.minY, Math.min(b.maxY, playerPositions[idx].y));
      combatUnits.push({ ...pData, uid: `u_p_${idx}`, team: 'player', x: spawnX, y: spawnY, hasMoved: false, hasActed: false, ...stats });
    });

    const enemyCount = enemyEnt.power + 1;
    for (let i = 0; i < enemyCount; i++) {
      const isMage = Math.random() > 0.7;
      const job = isMage ? 'Mage' : (Math.random() > 0.5 ? 'Knight' : 'Archer');
      const eData = { job, level: st.playerData.level + (Math.random() > 0.8 ? 1 : 0), enchantSlots: [] };
      const stats = calcUnitStats(eData);
      let spawnEx = Math.max(b.minX, Math.min(b.maxX, ex + Math.floor(Math.random()*3)-1));
      let spawnEy = Math.max(b.minY, Math.min(b.maxY, ey + Math.floor(Math.random()*3)-1));
      combatUnits.push({ ...eData, uid: `u_e_${i}`, team: 'enemy', x: spawnEx, y: spawnEy, hp: stats.maxHp, hasMoved: false, hasActed: false, ...stats });
    }

    setCombatState({ enemyEntId: enemyEnt.id, boundary: b, units: combatUnits, turn: 'player', selectedUnit: null, actionState: 'idle', hlCells: [] });
    setMode('COMBAT');
    const pos = toIso(centerX, centerY, getCellZ(worldMap, centerX, centerY));
    cameraRef.current.x = -pos.cx; cameraRef.current.y = -pos.cy + 50;
    showFloatText(centerX, centerY, '遭遇战!', '#ef4444');
  };

  const showFloatText = (x, y, text, color) => floatingTextsRef.current.push({ id: Date.now()+Math.random(), x, y, text, color, life: 60 });
  const getCombatUnitAt = (units, x, y) => units.find(u => u.x === x && u.y === y && u.hp > 0);

  const executeAttack = (targetX, targetY) => {
    const cState = stateRef.current.combatState;
    const attacker = cState.selectedUnit;
    const isAoe = JOBS[attacker.job].aoe;
    let targets = [];
    if (isAoe) {
      [{dx:0,dy:0}, {dx:1,dy:0}, {dx:-1,dy:0}, {dx:0,dy:1}, {dx:0,dy:-1}].forEach(off => {
        const u = getCombatUnitAt(cState.units, targetX + off.dx, targetY + off.dy);
        if (u && u.team !== attacker.team) targets.push(u);
      });
    } else {
      const u = getCombatUnitAt(cState.units, targetX, targetY);
      if (u && u.team !== attacker.team) targets.push(u);
    }

    if (targets.length === 0) { setCombatState(prev => ({...prev, actionState: 'idle', hlCells: []})); return; }
    const attackerZ = getCellZ(worldMap, attacker.x, attacker.y);

    setCombatState(prev => {
      const newUnits = prev.units.map(u => {
        const isTarget = targets.find(t => t.uid === u.uid);
        if (isTarget) {
          const targetZ = getCellZ(worldMap, u.x, u.y);
          let dmg = attacker.atk;
          if (attacker.job === 'Archer' && attackerZ > targetZ) dmg += Math.floor((attackerZ - targetZ) * 6); 
          dmg = Math.floor(dmg * (0.85 + Math.random() * 0.3));
          showFloatText(u.x, u.y, `-${dmg}`, '#ef4444');
          return { ...u, hp: Math.max(0, u.hp - dmg) };
        }
        if (u.uid === attacker.uid) return { ...u, hasActed: true };
        return u;
      });
      return { ...prev, units: newUnits, actionState: 'idle', hlCells: [] };
    });
    setTimeout(() => checkBattleResult(), 600);
  };

  const checkBattleResult = () => {
    const cState = stateRef.current.combatState;
    const playerAlive = cState.units.filter(u => u.team === 'player' && u.hp > 0).length > 0;
    const enemyAlive = cState.units.filter(u => u.team === 'enemy' && u.hp > 0).length > 0;

    if (!enemyAlive) {
      const expGain = cState.units.filter(u=>u.team==='enemy').length * 20;
      const goldGain = cState.units.filter(u=>u.team==='enemy').length * 15;
      const gemDrop = Math.random() > 0.6 ? (Math.random() > 0.5 ? 'ruby' : 'emerald') : null;
      
      setPlayerData(p => {
        const newP = {...p, exp: p.exp + expGain, gold: p.gold + goldGain};
        if (gemDrop) newP.inventory[gemDrop] = (newP.inventory[gemDrop] || 0) + 1;
        newP.party = newP.party.map(pm => {
          const cUnit = cState.units.find(u => u.id === pm.id); return cUnit ? {...pm, hp: cUnit.hp} : pm;
        });
        return newP;
      });
      
      setEntities(prev => prev.filter(e => e.id !== cState.enemyEntId));
      setMode('EXPLORE'); setExploreState({isSelected:false, hlCells:[]}); setCombatState(null);
      showFloatText(stateRef.current.playerData.pos.x, stateRef.current.playerData.pos.y, `胜利! +${expGain}EXP`, '#fde047');
      
      if (stateRef.current.playerData.exp + expGain >= stateRef.current.playerData.level * 100) {
        setPlayerData(prev => {
          const nextLvl = prev.level + 1;
          return {
            ...prev, exp: prev.exp - prev.level*100, level: nextLvl,
            party: prev.party.map(p => {
              const newStats = calcUnitStats({...p, level: nextLvl});
              return { ...p, level: nextLvl, hp: newStats.maxHp, maxHp: newStats.maxHp };
            })
          };
        });
        showFloatText(stateRef.current.playerData.pos.x, stateRef.current.playerData.pos.y-2, 'LEVEL UP!', '#fde047');
      }
    } else if (!playerAlive) {
      setPlayerData(p => ({
        ...p, gold: Math.floor(p.gold * 0.5), pos: {x: 10, y: 10}, party: p.party.map(pm => ({...pm, hp: calcUnitStats(pm).maxHp}))
      }));
      setMode('EXPLORE'); setExploreState({isSelected:false, hlCells:[]}); setCombatState(null);
      showFloatText(10, 10, '全灭，村庄重生', '#ef4444');
    } else {
      const activeTeam = cState.turn;
      const allDone = cState.units.filter(u => u.team === activeTeam && u.hp > 0).every(u => u.hasMoved && u.hasActed);
      if (allDone) {
        setCombatState(p => ({
          ...p, turn: p.turn === 'player' ? 'enemy' : 'player', selectedUnit: null, actionState: 'idle', hlCells: [],
          units: p.units.map(u => ({...u, hasMoved:false, hasActed:false}))
        }));
      }
    }
  };

  useEffect(() => {
    if (mode === 'COMBAT' && combatState?.turn === 'enemy') {
      let delay = 800;
      combatState.units.filter(u => u.team === 'enemy' && u.hp > 0).forEach((enemy, idx) => {
        setTimeout(() => {
          setCombatState(currState => {
            const currentEnemy = currState.units.find(u=>u.uid === enemy.uid);
            if(!currentEnemy || currentEnemy.hp <= 0) return currState;

            let newUnits = [...currState.units];
            const moves = calculateMoveRange(currentEnemy.x, currentEnemy.y, currentEnemy.move, currentEnemy.jump, false, currState.boundary);
            if (moves.length > 0) {
              const moveTarget = moves[Math.floor(Math.random() * moves.length)];
              newUnits = newUnits.map(u => u.uid === currentEnemy.uid ? { ...u, x: moveTarget.x, y: moveTarget.y, hasMoved: true } : u);
            }
            
            const updatedEnemy = newUnits.find(u=>u.uid === enemy.uid);
            for(let tgt of newUnits) {
               if(tgt.team === 'player' && tgt.hp > 0 && Math.abs(tgt.x - updatedEnemy.x) + Math.abs(tgt.y - updatedEnemy.y) <= updatedEnemy.range) {
                    const dmg = Math.floor(updatedEnemy.atk * (0.8+Math.random()*0.4));
                    showFloatText(tgt.x, tgt.y, `-${dmg}`, '#ef4444');
                    newUnits = newUnits.map(u => u.uid === tgt.uid ? {...u, hp: Math.max(0, u.hp-dmg)} : u);
                    break;
               }
            }
            newUnits = newUnits.map(u => u.uid === currentEnemy.uid ? { ...u, hasActed: true } : u);
            return {...currState, units: newUnits};
          });
          setTimeout(() => checkBattleResult(), 400); 
        }, delay * (idx + 1));
      });
    }
  }, [mode, combatState?.turn]);

  // ================= 终极精准与防双击 Pointer 引擎 =================
  const interaction = useRef({ isDown: false, startX: 0, startY: 0, maxDist: 0, lastX: 0, lastY: 0 });
  
  const handlePointerDown = (e) => {
    interaction.current = { isDown: true, startX: e.clientX, startY: e.clientY, maxDist: 0, lastX: e.clientX, lastY: e.clientY };
  };
  
  const handlePointerMove = (e) => {
    if (!interaction.current.isDown) return;
    const dx = e.clientX - interaction.current.lastX; 
    const dy = e.clientY - interaction.current.lastY;
    interaction.current.maxDist = Math.max(interaction.current.maxDist, Math.hypot(e.clientX - interaction.current.startX, e.clientY - interaction.current.startY));
    
    if (interaction.current.maxDist > 10) { 
      cameraRef.current.x += dx; 
      cameraRef.current.y += dy; 
    }
    interaction.current.lastX = e.clientX; 
    interaction.current.lastY = e.clientY;
  };
  
  const handlePointerUp = (e) => {
    if (!interaction.current.isDown) return;
    interaction.current.isDown = false;
    
    if (interaction.current.maxDist <= 10) {
      handleGridClick(e.clientX, e.clientY);
    }
  };

  const handleGridClick = (screenX, screenY) => {
    const st = stateRef.current;
    if (st.mode !== 'EXPLORE' && st.mode !== 'COMBAT') return;

    const canvas = canvasRef.current;
    if(!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = screenX - rect.left; 
    const y = screenY - rect.top;
    const ctx = canvas.getContext('2d');
    const { x: camX, y: camY, zoom } = cameraRef.current;
    const cx = canvas.width/2 + camX; 
    const cy = canvas.height/2 + camY;

    let clickedCell = null;
    const renderables = renderablesRef.current;

    // 完全不依赖 ctx.scale，直接用欧几里得距离与投影映射判定像素坐标 (极致精准)
    for (let i = renderables.length - 1; i >= 0; i--) {
      const item = renderables[i];
      
      if (item.type === 'player_leader') {
         const z = getCellZ(worldMap, st.playerData.pos.x, st.playerData.pos.y);
         const pos = toIso(st.playerData.pos.x+0.5, st.playerData.pos.y+0.5, z);
         const hitX = cx + pos.cx * zoom;
         const hitY = cy + (pos.cy - 15) * zoom;
         if (Math.hypot(x - hitX, y - hitY) <= 40 * zoom) {
             clickedCell = {x: st.playerData.pos.x, y: st.playerData.pos.y}; break;
         }
      } else if (item.type === 'combat_unit') {
         const z = getCellZ(worldMap, item.unit.x, item.unit.y);
         const pos = toIso(item.unit.x+0.5, item.unit.y+0.5, z);
         const hitX = cx + pos.cx * zoom; 
         const hitY = cy + (pos.cy - 12) * zoom;
         if (Math.hypot(x - hitX, y - hitY) <= 40 * zoom) {
             clickedCell = {x: item.unit.x, y: item.unit.y}; break;
         }
      } else if (item.type === 'entity') {
         const z = getCellZ(worldMap, item.ent.x, item.ent.y);
         const pos = toIso(item.ent.x+0.5, item.ent.y+0.5, z);
         const hitX = cx + pos.cx * zoom; 
         const hitY = cy + (pos.cy - 15) * zoom;
         if (Math.hypot(x - hitX, y - hitY) <= 35 * zoom) {
             clickedCell = {x: item.ent.x, y: item.ent.y}; break;
         }
      } else if (item.type === 'cell') {
         const { x: gx, y: gy } = item;
         const z0 = worldMap[gx][gy], z1 = worldMap[gx+1][gy], z2 = worldMap[gx+1][gy+1], z3 = worldMap[gx][gy+1];
         const p0 = toIso(gx, gy, z0), p1 = toIso(gx+1, gy, z1), p2 = toIso(gx+1, gy+1, z2), p3 = toIso(gx, gy+1, z3);
         
         ctx.setTransform(1, 0, 0, 1, 0, 0); // 重置矩阵保证运算一致性
         ctx.beginPath();
         ctx.moveTo(cx + p0.cx * zoom, cy + p0.cy * zoom);
         ctx.lineTo(cx + p1.cx * zoom, cy + p1.cy * zoom);
         ctx.lineTo(cx + p2.cx * zoom, cy + p2.cy * zoom);
         ctx.lineTo(cx + p3.cx * zoom, cy + p3.cy * zoom);
         ctx.closePath();
         if (ctx.isPointInPath(x, y)) {
             clickedCell = {x: item.x, y: item.y}; break;
         }
      }
    }

    if(clickedCell) {
       if (st.mode === 'EXPLORE') handleExploreGridClick(clickedCell.x, clickedCell.y);
       else if (st.mode === 'COMBAT') processCombatClick(clickedCell.x, clickedCell.y);
    }
  };

  const processCombatClick = (tx, ty) => {
      const st = stateRef.current; const cState = st.combatState;
      const clickedUnit = getCombatUnitAt(cState.units, tx, ty);
      if (cState.actionState === 'moving') {
        if (cState.hlCells.find(c=>c.x===tx && c.y===ty)) {
          setCombatState(p => ({
            ...p, actionState:'idle', hlCells:[], selectedUnit: {...p.selectedUnit, x:tx, y:ty, hasMoved:true},
            units: p.units.map(u => u.uid === p.selectedUnit.uid ? {...u, x:tx, y:ty, hasMoved:true} : u)
          }));
          setTimeout(checkBattleResult, 100);
        } else setCombatState(p=>({...p, actionState:'idle', hlCells:[]}));
        return;
      }
      if (cState.actionState === 'attacking') {
        if (cState.hlCells.find(c=>c.x===tx && c.y===ty)) executeAttack(tx, ty);
        else setCombatState(p=>({...p, actionState:'idle', hlCells:[]}));
        return;
      }
      if (clickedUnit) setCombatState(p=>({...p, selectedUnit: clickedUnit, hlCells:[]}));
      else setCombatState(p=>({...p, selectedUnit: null}));
  };

  // ================= 渲染循环 =================
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let frameId;

    const render = () => {
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      const { x: camX, y: camY, zoom } = cameraRef.current;
      const cx = canvas.width/2 + camX; const cy = canvas.height/2 + camY;
      ctx.translate(cx, cy); ctx.scale(zoom, zoom);

      const st = stateRef.current;
      const renderList = [];

      for (let x = 0; x < WORLD_SIZE; x++) {
        for (let y = 0; y < WORLD_SIZE; y++) {
          const z = getCellZ(worldMap, x, y);
          const pos = toIso(x+0.5, y+0.5, z);
          if (cx + pos.cx*zoom < -150 || cx + pos.cx*zoom > canvas.width+150 || cy + pos.cy*zoom < -150 || cy + pos.cy*zoom > canvas.height+150) continue;
          
          renderList.push({ type: 'cell', x, y, z: x+y });
          const ent = st.entities.find(e => e.x === x && e.y === y);
          if (ent) renderList.push({ type: 'entity', ent, z: x+y+0.5 });
          
          if (st.mode === 'EXPLORE' && st.playerData.pos.x === x && st.playerData.pos.y === y) {
            renderList.push({ type: 'player_leader', z: x+y+0.6 });
          }
          if (st.mode === 'COMBAT') {
            const u = getCombatUnitAt(st.combatState.units, x, y);
            if (u) renderList.push({ type: 'combat_unit', unit: u, z: x+y+0.6 });
          }
        }
      }

      renderList.sort((a, b) => a.z - b.z);
      renderablesRef.current = renderList; 

      renderList.forEach(item => {
        if (item.type === 'cell') {
          const { x, y } = item;
          const z0 = worldMap[x][y], z1 = worldMap[x+1][y], z2 = worldMap[x+1][y+1], z3 = worldMap[x][y+1];
          const avgZ = (z0+z1+z2+z3)/4;
          const p0 = toIso(x, y, z0), p1 = toIso(x+1, y, z1), p2 = toIso(x+1, y+1, z2), p3 = toIso(x, y+1, z3);

          ctx.beginPath();
          ctx.moveTo(p0.cx, p0.cy); ctx.lineTo(p1.cx, p1.cy); ctx.lineTo(p2.cx, p2.cy); ctx.lineTo(p3.cx, p3.cy);
          ctx.closePath();
          
          ctx.fillStyle = getTerrainColor(avgZ);
          
          if (st.mode === 'COMBAT') {
             const b = st.combatState.boundary;
             if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) ctx.fillStyle = '#1e293b'; 
             else if (x === b.minX || x === b.maxX || y === b.minY || y === b.maxY) ctx.fillStyle = COLORS.combatBoundary;
          }

          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();

          if (st.mode === 'EXPLORE' && st.exploreState.isSelected) {
            if(st.exploreState.hlCells.find(c => c.x === x && c.y === y)) {
               ctx.fillStyle = COLORS.exploreMove; ctx.fill();
               ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
            }
            if (st.playerData.pos.x === x && st.playerData.pos.y === y) {
               ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3; ctx.stroke(); 
            }
          }
          if (st.mode === 'COMBAT' && st.combatState.hlCells.length > 0) {
             const hl = st.combatState.hlCells.find(c => c.x === x && c.y === y);
             if(hl) {
               ctx.fillStyle = hl.type === 'move' ? COLORS.highlightMove : COLORS.highlightAttack; ctx.fill();
               ctx.strokeStyle = hl.type === 'move' ? '#60a5fa' : '#f87171'; ctx.lineWidth = 2; ctx.stroke();
             }
          }
        } 
        else if (item.type === 'entity') {
          const { ent } = item;
          if (st.mode === 'COMBAT' && ent.type === 'enemy_patrol' && ent.id === st.combatState.enemyEntId) return;

          const z = getCellZ(worldMap, ent.x, ent.y);
          const pos = toIso(ent.x+0.5, ent.y+0.5, z);
          ctx.save(); ctx.translate(pos.cx, pos.cy - 15);
          
          if(ent.type === 'shrine' || ent.type === 'village') {
            ctx.font = '30px Arial'; ctx.textAlign = 'center'; ctx.fillText(ent.icon, 0, 0);
            ctx.fillStyle = 'white'; ctx.font = '12px Arial'; ctx.fillText(ent.name, 0, 18);
          } else {
             ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 15, 12, 6, 0, 0, Math.PI*2); ctx.fill();
             ctx.fillStyle = ent.type === 'enemy_patrol' ? '#ef4444' : '#fbbf24';
             ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI*2); ctx.fill();
             ctx.fillStyle='white'; ctx.font='16px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(ent.icon, 0, 0);
          }
          ctx.restore();
        }
        else if (item.type === 'player_leader') {
          const p = st.playerData.pos;
          const z = getCellZ(worldMap, p.x, p.y);
          const pos = toIso(p.x+0.5, p.y+0.5, z);
          const leader = st.playerData.party[0];
          
          ctx.save(); ctx.translate(pos.cx, pos.cy - 15);
          const hoverY = Math.sin(Date.now() / 200) * 3; ctx.translate(0, hoverY);
          
          if (st.mode === 'EXPLORE' && !st.exploreState.isSelected) {
            const pulse = Math.abs(Math.sin(Date.now() / 400));
            ctx.strokeStyle = `rgba(251, 191, 36, ${0.4 + pulse * 0.6})`; 
            ctx.lineWidth = 2 + pulse * 4;
            ctx.beginPath(); ctx.arc(0, 0, 22 + pulse * 6, 0, Math.PI*2); ctx.stroke();
          }

          ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 15 - hoverY, 14, 7, 0, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = JOBS[leader.job].color; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle='white'; ctx.font='14px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(JOBS[leader.job].icon, 0, 0);
          
          ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(10, -10, 6, 0, Math.PI*2); ctx.fill();
          ctx.strokeStyle='white'; ctx.lineWidth=1.5; ctx.stroke();
          ctx.restore();
        }
        else if (item.type === 'combat_unit') {
          const { unit } = item;
          const z = getCellZ(worldMap, unit.x, unit.y);
          const pos = toIso(unit.x+0.5, unit.y+0.5, z);
          const job = JOBS[unit.job];
          
          ctx.save(); ctx.translate(pos.cx, pos.cy - 12);
          ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 12, 16, 8, 0, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(0, -15, 20, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = (unit.hasMoved && unit.hasActed) ? '#64748b' : job.color;
          ctx.beginPath(); ctx.arc(0, -15, 16, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle='white'; ctx.font='16px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(job.icon, 0, -15);
          
          ctx.fillStyle = unit.team === 'player' ? '#3b82f6' : '#ef4444';
          ctx.beginPath(); ctx.arc(12, -4, 7, 0, Math.PI*2); ctx.fill();
          ctx.strokeStyle='white'; ctx.lineWidth=2; ctx.stroke();

          if (st.combatState.selectedUnit?.uid === unit.uid) {
            ctx.strokeStyle = '#fde047'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(0, -15, 23, 0, Math.PI*2); ctx.stroke();
          }

          const hpRatio = unit.hp / unit.maxHp;
          ctx.fillStyle = '#1e293b'; ctx.fillRect(-15, 10, 30, 5);
          ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.2 ? '#f59e0b' : '#ef4444';
          ctx.fillRect(-14, 11, 28 * hpRatio, 3);
          ctx.restore();
        }
      });

      floatingTextsRef.current.forEach(ft => {
        const cellZ = getCellZ(worldMap, ft.x, ft.y);
        const pos = toIso(ft.x + 0.5, ft.y + 0.5, cellZ);
        const yOff = 45 - (60 - ft.life) * 1.5; 
        ctx.save(); ctx.translate(pos.cx, pos.cy - yOff);
        ctx.fillStyle = ft.color; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'center';
        ctx.shadowColor = 'black'; ctx.shadowBlur = 4; ctx.fillText(ft.text, 0, 0);
        ctx.restore();
        ft.life -= 1;
      });
      floatingTextsRef.current = floatingTextsRef.current.filter(ft => ft.life > 0);

      frameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(frameId);
  }, [worldMap]);


  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-900 select-none font-sans text-slate-800">
      
      {/* 完全抛弃所有老旧的 onTouch / onMouse 事件！只使用单一的 PointerEvents，根除幽灵双击 */}
      <canvas
        ref={canvasRef}
        className="block touch-none cursor-pointer"
        onPointerDown={handlePointerDown} 
        onPointerMove={handlePointerMove} 
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* 顶部UI */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none z-10">
        <div className="bg-slate-800/90 backdrop-blur text-white px-4 py-2 rounded-2xl shadow-lg border border-slate-700 flex gap-4 pointer-events-auto">
          <div className="flex flex-col">
            <span className="text-xs text-slate-400">小队等级</span>
            <span className="font-bold text-lg text-yellow-400">Lv.{playerData.level}</span>
          </div>
          <div className="w-px bg-slate-600"></div>
          <div className="flex flex-col">
            <span className="text-xs text-slate-400">金币</span>
            <span className="font-bold text-lg text-yellow-400">🪙 {playerData.gold}</span>
          </div>
        </div>

        {mode === 'EXPLORE' && (
          <button 
            className="bg-blue-600/90 hover:bg-blue-500 backdrop-blur text-white p-3 rounded-full shadow-lg border border-blue-400 pointer-events-auto flex items-center gap-2 transition active:scale-95"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setMode('MENU')}
          >
            <span className="text-xl">🎒</span>
            <span className="font-bold pr-2 hidden sm:inline">队伍与附魔</span>
          </button>
        )}
      </div>

      <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        {mode === 'EXPLORE' && !exploreState.isSelected && <div className="bg-black/50 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-lg border border-white/10">点击有光圈的主角以探索</div>}
        {mode === 'EXPLORE' && exploreState.isSelected && <div className="bg-blue-600/80 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-lg animate-bounce">请点击发光的白色区域移动</div>}
        {mode === 'COMBAT' && combatState?.turn === 'player' && <div className="bg-red-600/80 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-[0_0_15px_rgba(220,38,38,0.5)]">⚔️ 玩家回合 - 请下达指令</div>}
        {mode === 'COMBAT' && combatState?.turn === 'enemy' && <div className="bg-slate-800/80 text-white px-4 py-1.5 rounded-full text-sm font-bold">🛡️ 敌方行动中...</div>}
      </div>

      {/* 战斗面板 - 增加 stopPropagation 防止透过 UI 点到游戏地图 */}
      {mode === 'COMBAT' && combatState?.selectedUnit && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-11/12 max-w-md" onPointerDown={(e) => e.stopPropagation()}>
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl p-4 shadow-2xl flex flex-col gap-3 border border-white/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl text-white ${combatState.selectedUnit.team==='player'?'bg-blue-500':'bg-red-500'}`}>
                  {JOBS[combatState.selectedUnit.job].icon}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">{JOBS[combatState.selectedUnit.job].name} <span className="text-xs text-slate-400">Lv.{combatState.selectedUnit.level}</span></h3>
                  <div className="text-xs font-semibold text-slate-500">HP: {combatState.selectedUnit.hp}/{combatState.selectedUnit.maxHp} | 攻: {combatState.selectedUnit.atk}</div>
                </div>
              </div>
              <button className="w-8 h-8 bg-slate-100 rounded-full text-slate-500" onClick={() => setCombatState(p=>({...p, selectedUnit:null, actionState:'idle', hlCells:[]}))}>✕</button>
            </div>
            
            {combatState.selectedUnit.team === 'player' && combatState.turn === 'player' && (
              <div className="flex gap-2 mt-2">
                <button 
                  disabled={combatState.selectedUnit.hasMoved}
                  className={`flex-1 py-2 rounded-xl font-bold ${combatState.selectedUnit.hasMoved ? 'bg-slate-100 text-slate-400' : (combatState.actionState === 'moving' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700')}`}
                  onClick={() => setCombatState(p=>({...p, actionState: p.actionState==='moving'?'idle':'moving', hlCells: p.actionState==='moving'?[]:calculateMoveRange(p.selectedUnit.x, p.selectedUnit.y, p.selectedUnit.move, p.selectedUnit.jump, false, p.boundary)}))}
                >移动</button>
                <button 
                  disabled={combatState.selectedUnit.hasActed}
                  className={`flex-1 py-2 rounded-xl font-bold ${combatState.selectedUnit.hasActed ? 'bg-slate-100 text-slate-400' : (combatState.actionState === 'attacking' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700')}`}
                  onClick={() => setCombatState(p=>({...p, actionState: p.actionState==='attacking'?'idle':'attacking', hlCells: p.actionState==='attacking'?[]:calculateMoveRange(p.selectedUnit.x, p.selectedUnit.y, p.selectedUnit.range, 99, true, p.boundary)}))} 
                >攻击</button>
                <button 
                  disabled={combatState.selectedUnit.hasActed || playerData.potions <= 0}
                  className="flex-1 py-2 rounded-xl font-bold bg-green-100 text-green-700 disabled:opacity-50"
                  onClick={() => {
                     setPlayerData(p => ({...p, potions: p.potions - 1}));
                     setCombatState(prev => ({
                        ...prev, actionState: 'idle', hlCells: [],
                        units: prev.units.map(u => u.uid === prev.selectedUnit.uid ? {...u, hp: Math.min(u.maxHp, u.hp + 50), hasActed: true} : u)
                     }));
                     showFloatText(combatState.selectedUnit.x, combatState.selectedUnit.y, '+50', '#4ade80');
                     setTimeout(checkBattleResult, 100);
                  }}
                >喝药({playerData.potions})</button>
                <button 
                  className="flex-1 py-2 rounded-xl font-bold bg-slate-100 text-slate-700"
                  onClick={() => {
                    setCombatState(p=>({...p, units: p.units.map(u=>u.uid===p.selectedUnit.uid?{...u, hasMoved:true, hasActed:true}:u), selectedUnit:null, actionState:'idle', hlCells:[]}));
                    setTimeout(checkBattleResult, 100);
                  }}
                >待机</button>
              </div>
            )}
          </div>
        </div>
      )}

      {mode === 'DIALOG' && dialogData && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-30 flex items-center justify-center p-4" onPointerDown={(e) => e.stopPropagation()}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl relative">
            <h2 className="text-2xl font-bold mb-4">{dialogData.name}</h2>
            <p className="text-slate-600 text-lg mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">{dialogData.text}</p>
            {dialogData.type === 'shop' && (
              <div className="flex flex-col gap-3 mb-6">
                <button className="flex justify-between p-3 bg-blue-50 hover:bg-blue-100 rounded-xl font-bold text-blue-800" 
                  onClick={() => {
                    if(playerData.gold >= 50) { setPlayerData(p=>({...p, gold:p.gold-50, potions: p.potions+1})); alert("购买成功!"); }
                    else alert("金币不足");
                  }}
                ><span>🧪 恢复药水 (群体回血50)</span><span>🪙 50</span></button>
              </div>
            )}
            <button className="w-full py-3 bg-slate-800 text-white font-bold rounded-xl active:scale-95 transition" onClick={() => {setMode('EXPLORE'); setDialogData(null);}}>离开</button>
          </div>
        </div>
      )}

      {mode === 'MENU' && (
        <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md z-40 flex flex-col p-4 md:p-8" onPointerDown={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-6 text-white">
            <h1 className="text-3xl font-bold">营地与装备</h1>
            <button className="text-4xl hover:text-red-400 transition" onClick={() => setMode('EXPLORE')}>✕</button>
          </div>

          <div className="bg-slate-800/50 rounded-2xl p-4 mb-6 border border-slate-600 text-white flex justify-between">
            <div>
              <div className="text-slate-400 text-sm">小队总资产</div>
              <div className="font-bold text-xl">🪙 {playerData.gold}G | 🧪药水x{playerData.potions}</div>
            </div>
            <div className="text-right">
              <div className="text-slate-400 text-sm">剩余未镶嵌宝石</div>
              <div className="font-bold text-xl">🔴红宝石x{playerData.inventory.ruby||0} | 🟢绿宝石x{playerData.inventory.emerald||0}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 overflow-y-auto pb-10">
            {playerData.party.map((pData, idx) => {
              const job = JOBS[pData.job];
              const finalStats = calcUnitStats(pData);
              return (
                <div key={idx} className="bg-white rounded-3xl p-5 shadow-xl flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shadow-inner text-white" style={{backgroundColor: job.color}}>{job.icon}</div>
                    <div>
                      <h2 className="text-xl font-black text-slate-800">{job.name} <span className="text-sm font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full ml-1">Lv.{pData.level}</span></h2>
                      <div className="text-slate-500 font-semibold mt-1">专属武器: {job.weapon}</div>
                    </div>
                  </div>
                  
                  <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="text-slate-600">生命值: <span className="font-bold text-slate-900">{finalStats.maxHp}</span></div>
                    <div className="text-slate-600">攻击力: <span className="font-bold text-slate-900">{finalStats.atk}</span></div>
                    <div className="text-slate-600">移动力: <span className="font-bold text-slate-900">{finalStats.move}</span></div>
                    <div className="text-slate-600">跳跃力: <span className="font-bold text-slate-900">{finalStats.jump}</span></div>
                  </div>

                  <div className="border-t border-slate-100 pt-3">
                    <div className="text-sm font-bold text-slate-700 mb-2">武器附魔槽位 (点击镶嵌/卸下)</div>
                    <div className="flex gap-3">
                      {[0, 1].map(slotIdx => {
                         const gemId = pData.enchantSlots[slotIdx];
                         return (
                           <div key={slotIdx}
                             className="w-10 h-10 border-2 border-dashed border-slate-400 rounded-lg flex items-center justify-center cursor-pointer hover:bg-slate-100 bg-slate-50 transition"
                             onClick={() => {
                               setPlayerData(prev => {
                                 const newParty = [...prev.party];
                                 const newInv = {...prev.inventory};
                                 
                                 if (gemId) {
                                   newInv[gemId] = (newInv[gemId] || 0) + 1;
                                   newParty[idx].enchantSlots[slotIdx] = null;
                                 } else {
                                   if (newInv.ruby > 0) { newInv.ruby--; newParty[idx].enchantSlots[slotIdx] = 'ruby'; }
                                   else if (newInv.emerald > 0) { newInv.emerald--; newParty[idx].enchantSlots[slotIdx] = 'emerald'; }
                                 }
                                 const newStats = calcUnitStats({...newParty[idx]});
                                 newParty[idx].hp = Math.min(newParty[idx].hp, newStats.maxHp);
                                 return { ...prev, party: newParty, inventory: newInv };
                               });
                             }}
                           >
                             {gemId ? <span className="text-xl">{GEMS[gemId].icon}</span> : <span className="text-slate-300">+</span>}
                           </div>
                         )
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}