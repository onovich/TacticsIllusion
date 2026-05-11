import { useEffect, useRef, useState } from 'react';
import { COLORS, createInitialPlayerData, JOBS, WORLD_SIZE } from '../../data/gameData.js';
import { calcUnitStats, createCombatState, getCombatUnitAt } from '../../logic/engine/combatEngine.js';
import { calculateMoveRange as calculateGridMoveRange, generateEntities, generateWorld, getCellZ, getTerrainColor, toIso } from '../../logic/engine/worldEngine.js';
import { useLatestRef } from '../../logic/hooks/useLatestRef.js';
import CombatActionPanel from '../components/CombatActionPanel.jsx';
import ModeBanner from '../components/ModeBanner.jsx';
import TopHud from '../components/TopHud.jsx';
import CampMenuScreen from './CampMenuScreen.jsx';
import DialogScreen from './DialogScreen.jsx';

const MOVE_TWEEN_DURATION = 240;
const TWEEN_EPSILON = 0.001;
const EXPLORE_CAMERA_Y_OFFSET = 100;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const easeOutCubic = (value) => 1 - ((1 - value) ** 3);

const getTweenPosition = (tween, now) => {
  if (!tween || tween.duration === 0) {
    return tween ? { x: tween.toX, y: tween.toY } : null;
  }

  const progress = clamp((now - tween.startedAt) / tween.duration, 0, 1);
  const eased = easeOutCubic(progress);

  return {
    x: tween.fromX + (tween.toX - tween.fromX) * eased,
    y: tween.fromY + (tween.toY - tween.fromY) * eased,
  };
};

const syncTweenTarget = (tweenStore, key, target, now, options = {}) => {
  const initialPosition = options.initialPosition ?? target;
  const duration = options.duration ?? MOVE_TWEEN_DURATION;
  const existingTween = tweenStore[key];

  if (!existingTween) {
    const needsTween = Math.abs(initialPosition.x - target.x) > TWEEN_EPSILON || Math.abs(initialPosition.y - target.y) > TWEEN_EPSILON;
    tweenStore[key] = {
      fromX: needsTween ? initialPosition.x : target.x,
      fromY: needsTween ? initialPosition.y : target.y,
      toX: target.x,
      toY: target.y,
      startedAt: now,
      duration: needsTween ? duration : 0,
    };
    return needsTween ? { ...initialPosition } : { ...target };
  }

  const currentPosition = getTweenPosition(existingTween, now);
  const hasNewTarget = Math.abs(existingTween.toX - target.x) > TWEEN_EPSILON || Math.abs(existingTween.toY - target.y) > TWEEN_EPSILON;

  if (hasNewTarget) {
    tweenStore[key] = {
      fromX: currentPosition.x,
      fromY: currentPosition.y,
      toX: target.x,
      toY: target.y,
      startedAt: now,
      duration,
    };
    return currentPosition;
  }

  const hasArrived = Math.abs(currentPosition.x - existingTween.toX) <= TWEEN_EPSILON && Math.abs(currentPosition.y - existingTween.toY) <= TWEEN_EPSILON;
  if (hasArrived && existingTween.duration !== 0) {
    tweenStore[key] = {
      fromX: existingTween.toX,
      fromY: existingTween.toY,
      toX: existingTween.toX,
      toY: existingTween.toY,
      startedAt: now,
      duration: 0,
    };
    return { x: existingTween.toX, y: existingTween.toY };
  }

  return currentPosition;
};

const pruneTweenTargets = (tweenStore, validKeys) => {
  Object.keys(tweenStore).forEach((key) => {
    if (!validKeys.has(key)) {
      delete tweenStore[key];
    }
  });
};

const getAnimatedCellZ = (heightMap, x, y, worldSize = WORLD_SIZE) => {
  const clampedX = clamp(x, 0, worldSize - 1);
  const clampedY = clamp(y, 0, worldSize - 1);
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(worldSize - 1, x0 + 1);
  const y1 = Math.min(worldSize - 1, y0 + 1);
  const tx = clampedX - x0;
  const ty = clampedY - y0;
  const z00 = getCellZ(heightMap, x0, y0, worldSize);
  const z10 = getCellZ(heightMap, x1, y0, worldSize);
  const z01 = getCellZ(heightMap, x0, y1, worldSize);
  const z11 = getCellZ(heightMap, x1, y1, worldSize);

  return z00 * (1 - tx) * (1 - ty) + z10 * tx * (1 - ty) + z01 * (1 - tx) * ty + z11 * tx * ty;
};

const getCameraFocusPosition = (heightMap, x, y, yOffset, worldSize = WORLD_SIZE) => {
  const z = getAnimatedCellZ(heightMap, x, y, worldSize);
  const pos = toIso(x, y, z);

  return {
    x: -pos.cx,
    y: -pos.cy + yOffset,
  };
};

export default function TacticsIllusionScreen() {
  const canvasRef = useRef(null);
  
  // ================= 核心状态 =================
  const [mode, setMode] = useState('EXPLORE'); 
  const [playerData, setPlayerData] = useState(() => createInitialPlayerData());
  const [worldMap] = useState(() => generateWorld(WORLD_SIZE));
  const [entities, setEntities] = useState(() => generateEntities(WORLD_SIZE));
  const [dialogData, setDialogData] = useState(null);
  const [exploreState, setExploreState] = useState({ isSelected: false, hlCells: [] });
  const [combatState, setCombatState] = useState(null); 

  // 高性能引用库
  const cameraRef = useRef({ x: 0, y: 200, zoom: 1 });
  const cameraOffsetRef = useRef({ x: 0, y: 0 });
  const floatingTextsRef = useRef([]);
  const renderablesRef = useRef([]); 
  const motionTweensRef = useRef({});
  const stateRef = useLatestRef({ mode, playerData, entities, combatState, exploreState });

  useEffect(() => {
    const p = playerData.pos;
    const cameraPos = getCameraFocusPosition(worldMap, p.x, p.y, EXPLORE_CAMERA_Y_OFFSET);
    cameraRef.current.x = cameraPos.x;
    cameraRef.current.y = cameraPos.y;
  }, []);

  // ================= BFS寻路 =================
  const calculateMoveOptions = (startX, startY, moveRange, jumpPower, ignoreEntities = false, boundary = null) => {
    const st = stateRef.current;
    return calculateGridMoveRange({
      startX,
      startY,
      moveRange,
      jumpPower,
      heightMap: worldMap,
      entities: ignoreEntities ? [] : st.entities,
      combatUnits: st.mode === 'COMBAT' && st.combatState ? st.combatState.units : [],
      ignoreEntities,
      boundary,
      worldSize: WORLD_SIZE,
    });
  };

  // ================= 游戏交互逻辑 =================
  const handleExploreGridClick = (tx, ty) => {
    const st = stateRef.current; const p = st.playerData.pos; const expState = st.exploreState;
    if (tx === p.x && ty === p.y) {
      if (expState.isSelected) setExploreState({ isSelected: false, hlCells: [] });
      else setExploreState({ isSelected: true, hlCells: calculateMoveOptions(p.x, p.y, 10, 2, true) });
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

  const initCombat = (enemyEnt, actualPlayerPos) => {
    const st = stateRef.current;
    const centerX = Math.floor((actualPlayerPos.x + enemyEnt.x) / 2);
    const centerY = Math.floor((actualPlayerPos.y + enemyEnt.y) / 2);
    const nextCombatState = createCombatState({
      playerData: st.playerData,
      enemyEnt,
      actualPlayerPos,
      worldSize: WORLD_SIZE,
    });

    setCombatState(nextCombatState);
    setMode('COMBAT');
    const pos = toIso(centerX, centerY, getCellZ(worldMap, centerX, centerY));
    cameraRef.current.x = -pos.cx; cameraRef.current.y = -pos.cy + 50;
    showFloatText(centerX, centerY, '遭遇战!', '#ef4444');
  };

  const showFloatText = (x, y, text, color) => floatingTextsRef.current.push({ id: Date.now()+Math.random(), x, y, text, color, life: 60 });

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
          const currentState = stateRef.current.combatState;
          const currentEnemy = currentState?.units.find(u => u.uid === enemy.uid);
          if (!currentEnemy || currentEnemy.hp <= 0) {
            setTimeout(() => checkBattleResult(), 0);
            return;
          }

          const moves = calculateMoveOptions(currentEnemy.x, currentEnemy.y, currentEnemy.move, currentEnemy.jump, false, currentState.boundary);
          const moveTarget = moves.length > 0 ? moves[Math.floor(Math.random() * moves.length)] : null;
          const attackDelay = moveTarget ? MOVE_TWEEN_DURATION : 0;

          setCombatState(currState => ({
            ...currState,
            units: currState.units.map((unit) => {
              if (unit.uid !== enemy.uid) {
                return unit;
              }

              return {
                ...unit,
                x: moveTarget ? moveTarget.x : unit.x,
                y: moveTarget ? moveTarget.y : unit.y,
                hasMoved: true,
              };
            }),
          }));

          setTimeout(() => {
            setCombatState(currState => {
              const updatedEnemy = currState.units.find(u => u.uid === enemy.uid);
              if (!updatedEnemy || updatedEnemy.hp <= 0) {
                return currState;
              }

              let newUnits = [...currState.units];
              for (const tgt of newUnits) {
                if (tgt.team === 'player' && tgt.hp > 0 && Math.abs(tgt.x - updatedEnemy.x) + Math.abs(tgt.y - updatedEnemy.y) <= updatedEnemy.range) {
                  const dmg = Math.floor(updatedEnemy.atk * (0.8 + Math.random() * 0.4));
                  showFloatText(tgt.x, tgt.y, `-${dmg}`, '#ef4444');
                  newUnits = newUnits.map(u => u.uid === tgt.uid ? { ...u, hp: Math.max(0, u.hp - dmg) } : u);
                  break;
                }
              }

              newUnits = newUnits.map(u => u.uid === updatedEnemy.uid ? { ...u, hasActed: true } : u);
              return { ...currState, units: newUnits };
            });
            setTimeout(() => checkBattleResult(), 400);
          }, attackDelay);
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
      if (stateRef.current.mode === 'EXPLORE') {
        cameraOffsetRef.current.x += dx;
        cameraOffsetRef.current.y += dy;
      } else {
        cameraRef.current.x += dx; 
        cameraRef.current.y += dy; 
      }
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
       const z = getAnimatedCellZ(worldMap, item.displayPos.x, item.displayPos.y);
       const pos = toIso(item.displayPos.x+0.5, item.displayPos.y+0.5, z);
         const hitX = cx + pos.cx * zoom;
         const hitY = cy + (pos.cy - 15) * zoom;
         if (Math.hypot(x - hitX, y - hitY) <= 40 * zoom) {
             clickedCell = {x: st.playerData.pos.x, y: st.playerData.pos.y}; break;
         }
      } else if (item.type === 'combat_unit') {
       const z = getAnimatedCellZ(worldMap, item.displayPos.x, item.displayPos.y);
       const pos = toIso(item.displayPos.x+0.5, item.displayPos.y+0.5, z);
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

  const clearCombatSelection = () => {
    setCombatState((prev) => ({ ...prev, selectedUnit: null, actionState: 'idle', hlCells: [] }));
  };

  const toggleCombatMovement = () => {
    setCombatState((prev) => ({
      ...prev,
      actionState: prev.actionState === 'moving' ? 'idle' : 'moving',
      hlCells:
        prev.actionState === 'moving'
          ? []
          : calculateMoveOptions(prev.selectedUnit.x, prev.selectedUnit.y, prev.selectedUnit.move, prev.selectedUnit.jump, false, prev.boundary),
    }));
  };

  const toggleCombatAttack = () => {
    setCombatState((prev) => ({
      ...prev,
      actionState: prev.actionState === 'attacking' ? 'idle' : 'attacking',
      hlCells:
        prev.actionState === 'attacking'
          ? []
          : calculateMoveOptions(prev.selectedUnit.x, prev.selectedUnit.y, prev.selectedUnit.range, 99, true, prev.boundary),
    }));
  };

  const usePotion = () => {
    setPlayerData((prev) => ({ ...prev, potions: prev.potions - 1 }));
    setCombatState((prev) => ({
      ...prev,
      actionState: 'idle',
      hlCells: [],
      units: prev.units.map((unit) =>
        unit.uid === prev.selectedUnit.uid ? { ...unit, hp: Math.min(unit.maxHp, unit.hp + 50), hasActed: true } : unit,
      ),
    }));
    showFloatText(combatState.selectedUnit.x, combatState.selectedUnit.y, '+50', '#4ade80');
    setTimeout(checkBattleResult, 100);
  };

  const standbySelectedUnit = () => {
    setCombatState((prev) => ({
      ...prev,
      units: prev.units.map((unit) => (unit.uid === prev.selectedUnit.uid ? { ...unit, hasMoved: true, hasActed: true } : unit)),
      selectedUnit: null,
      actionState: 'idle',
      hlCells: [],
    }));
    setTimeout(checkBattleResult, 100);
  };

  const handleBuyPotion = () => {
    if (playerData.gold >= 50) {
      setPlayerData((prev) => ({ ...prev, gold: prev.gold - 50, potions: prev.potions + 1 }));
      alert('购买成功!');
      return;
    }

    alert('金币不足');
  };

  const handleToggleGem = (partyIndex, slotIndex, gemId) => {
    setPlayerData((prev) => {
      const newParty = [...prev.party];
      const newInv = { ...prev.inventory };

      if (gemId) {
        newInv[gemId] = (newInv[gemId] || 0) + 1;
        newParty[partyIndex].enchantSlots[slotIndex] = null;
      } else {
        if (newInv.ruby > 0) {
          newInv.ruby -= 1;
          newParty[partyIndex].enchantSlots[slotIndex] = 'ruby';
        } else if (newInv.emerald > 0) {
          newInv.emerald -= 1;
          newParty[partyIndex].enchantSlots[slotIndex] = 'emerald';
        }
      }

      const newStats = calcUnitStats({ ...newParty[partyIndex] });
      newParty[partyIndex].hp = Math.min(newParty[partyIndex].hp, newStats.maxHp);
      return { ...prev, party: newParty, inventory: newInv };
    });
  };

  // ================= 渲染循环 =================
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let frameId;

    const render = (frameTime) => {
      const now = frameTime ?? performance.now();
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, canvas.width, canvas.height);

      const st = stateRef.current;
      const activeTweenKeys = new Set(['player_leader']);
      const playerDisplayPos = syncTweenTarget(motionTweensRef.current, 'player_leader', st.playerData.pos, now);

      if (st.mode === 'EXPLORE') {
        activeTweenKeys.add('camera_follow');
        const cameraFocusTarget = getCameraFocusPosition(worldMap, st.playerData.pos.x, st.playerData.pos.y, EXPLORE_CAMERA_Y_OFFSET);
        const cameraFollowPos = syncTweenTarget(motionTweensRef.current, 'camera_follow', cameraFocusTarget, now, {
          initialPosition: cameraRef.current,
        });
        cameraRef.current.x = cameraFollowPos.x + cameraOffsetRef.current.x;
        cameraRef.current.y = cameraFollowPos.y + cameraOffsetRef.current.y;
      }

      ctx.save();
      const { x: camX, y: camY, zoom } = cameraRef.current;
      const cx = canvas.width/2 + camX; const cy = canvas.height/2 + camY;
      ctx.translate(cx, cy); ctx.scale(zoom, zoom);

      const renderList = [];

      for (let x = 0; x < WORLD_SIZE; x++) {
        for (let y = 0; y < WORLD_SIZE; y++) {
          const z = getCellZ(worldMap, x, y);
          const pos = toIso(x+0.5, y+0.5, z);
          if (cx + pos.cx*zoom < -150 || cx + pos.cx*zoom > canvas.width+150 || cy + pos.cy*zoom < -150 || cy + pos.cy*zoom > canvas.height+150) continue;
          
          renderList.push({ type: 'cell', x, y, z: x+y });
          const ent = st.entities.find(e => e.x === x && e.y === y);
          if (ent) renderList.push({ type: 'entity', ent, z: x+y+0.5 });
        }
      }

      if (st.mode === 'EXPLORE') {
        renderList.push({ type: 'player_leader', displayPos: playerDisplayPos, z: playerDisplayPos.x + playerDisplayPos.y + 0.6 });
      }

      if (st.mode === 'COMBAT' && st.combatState) {
        st.combatState.units
          .filter((unit) => unit.hp > 0)
          .forEach((unit) => {
            const tweenKey = `combat_unit:${unit.uid}`;
            activeTweenKeys.add(tweenKey);
            const displayPos = syncTweenTarget(motionTweensRef.current, tweenKey, { x: unit.x, y: unit.y }, now);
            renderList.push({ type: 'combat_unit', unit, displayPos, z: displayPos.x + displayPos.y + 0.6 });
          });
      }

      pruneTweenTargets(motionTweensRef.current, activeTweenKeys);

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
          const z = getAnimatedCellZ(worldMap, item.displayPos.x, item.displayPos.y);
          const pos = toIso(item.displayPos.x+0.5, item.displayPos.y+0.5, z);
          const leader = st.playerData.party[0];
          
          ctx.save(); ctx.translate(pos.cx, pos.cy - 15);
          const hoverY = Math.sin(now / 200) * 3; ctx.translate(0, hoverY);
          
          if (st.mode === 'EXPLORE' && !st.exploreState.isSelected) {
            const pulse = Math.abs(Math.sin(now / 400));
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
          const z = getAnimatedCellZ(worldMap, item.displayPos.x, item.displayPos.y);
          const pos = toIso(item.displayPos.x+0.5, item.displayPos.y+0.5, z);
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

      <TopHud mode={mode} level={playerData.level} gold={playerData.gold} onOpenMenu={() => setMode('MENU')} />
      <ModeBanner mode={mode} exploreState={exploreState} combatState={combatState} />
      <CombatActionPanel
        combatState={combatState}
        potions={playerData.potions}
        onClearSelection={clearCombatSelection}
        onToggleMove={toggleCombatMovement}
        onToggleAttack={toggleCombatAttack}
        onUsePotion={usePotion}
        onStandby={standbySelectedUnit}
      />

      {mode === 'DIALOG' && (
        <DialogScreen
          dialogData={dialogData}
          onBuyPotion={handleBuyPotion}
          onClose={() => {
            setMode('EXPLORE');
            setDialogData(null);
          }}
        />
      )}

      {mode === 'MENU' && (
        <CampMenuScreen
          playerData={playerData}
          calcUnitStats={calcUnitStats}
          onClose={() => setMode('EXPLORE')}
          onToggleGem={handleToggleGem}
        />
      )}
    </div>
  );
}