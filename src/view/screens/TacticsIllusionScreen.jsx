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
const CAMERA_TWEEN_DURATION = 560;
const TWEEN_EPSILON = 0.001;
const EXPLORE_CAMERA_Y_OFFSET = 100;
const COMBAT_CAMERA_Y_OFFSET = 50;
const CAMERA_FOLLOW_DAMPING = 10;
const COMBAT_FADE_DISTANCE = 6;
const COMBAT_DIMMED_ENTITY_ALPHA = 0.45;
const COMBAT_ENTITY_FILTER = 'grayscale(1) saturate(0.15) brightness(0.9)';
const ENEMY_ACTION_INTERVAL = 1400;
const HIT_REACTION_DURATION = 360;
const BLOOD_PARTICLE_DURATION = 520;
const ATTACK_PROFILES = {
  melee: { windupMs: 180, travelMs: 160, settleMs: 220, backstepDistance: 0.18, lungeDistance: 0.42, arcHeight: 0.7, accent: '#f59e0b' },
  arrow: { windupMs: 240, travelMs: 340, settleMs: 160, backstepDistance: 0.14, lungeDistance: 0.1, arcHeight: 2.2, accent: '#fbbf24' },
  spell: { windupMs: 320, travelMs: 260, settleMs: 200, backstepDistance: 0.1, lungeDistance: 0.08, arcHeight: 1.6, accent: '#c084fc' },
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const easeOutCubic = (value) => 1 - ((1 - value) ** 3);

const easeInOutCubic = (value) => (value < 0.5 ? 4 * value ** 3 : 1 - ((-2 * value + 2) ** 3) / 2);

const easeOutBack = (value) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;

  return 1 + c3 * ((value - 1) ** 3) + c1 * ((value - 1) ** 2);
};

const lerp = (from, to, progress) => from + (to - from) * progress;

const normalizeVector = (dx, dy) => {
  const length = Math.hypot(dx, dy) || 1;

  return {
    x: dx / length,
    y: dy / length,
    length,
  };
};

const getAttackStyle = (unit) => {
  if (unit.job === 'Archer') {
    return 'arrow';
  }

  if (unit.job === 'Mage') {
    return 'spell';
  }

  return 'melee';
};

const getAttackTargetCenter = (targets, fallbackCell) => {
  const points = targets.length > 0
    ? targets.map((target) => ({ x: target.x + 0.5, y: target.y + 0.5 }))
    : [{ x: fallbackCell.x + 0.5, y: fallbackCell.y + 0.5 }];
  const total = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
};

const createBloodParticles = (direction, count = 12) => Array.from({ length: count }, (_, index) => {
  const spread = (Math.random() - 0.5) * 1.2;
  const baseSpeed = 0.18 + Math.random() * 0.22;

  return {
    xBias: direction.x * 0.08,
    yBias: direction.y * 0.08,
    vx: direction.x * baseSpeed + spread * 0.22,
    vy: direction.y * baseSpeed + spread * 0.22,
    lift: 0.4 + Math.random() * 0.9,
    size: 2.4 + (index % 3) + Math.random() * 1.4,
  };
});

const syncSelectedUnitFromUnits = (selectedUnit, units) => {
  if (!selectedUnit) {
    return null;
  }

  return units.find((unit) => unit.uid === selectedUnit.uid) ?? null;
};

const createTimedTween = (from, to, duration = MOVE_TWEEN_DURATION, startedAt = performance.now()) => ({
  fromX: from.x,
  fromY: from.y,
  toX: to.x,
  toY: to.y,
  startedAt,
  duration,
});

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

const hasTweenArrived = (position, tween) => Math.abs(position.x - tween.toX) <= TWEEN_EPSILON && Math.abs(position.y - tween.toY) <= TWEEN_EPSILON;

const getDistanceOutsideBoundary = (x, y, boundary) => {
  const dx = x < boundary.minX ? boundary.minX - x : x > boundary.maxX ? x - boundary.maxX : 0;
  const dy = y < boundary.minY ? boundary.minY - y : y > boundary.maxY ? y - boundary.maxY : 0;

  return Math.max(dx, dy);
};

const getCombatCellOpacity = (x, y, boundary, fadeDistance = COMBAT_FADE_DISTANCE) => {
  const distanceOutside = getDistanceOutsideBoundary(x, y, boundary);

  if (distanceOutside === 0) {
    return 1;
  }

  const normalized = clamp(1 - distanceOutside / fadeDistance, 0, 1);
  return normalized ** 1.6;
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

const dampTowards = (current, target, deltaMs, damping = CAMERA_FOLLOW_DAMPING) => {
  if (deltaMs <= 0) {
    return current;
  }

  const blend = 1 - Math.exp((-damping * deltaMs) / 1000);

  return {
    x: current.x + (target.x - current.x) * blend,
    y: current.y + (target.y - current.y) * blend,
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
  const combatEffectsRef = useRef([]);
  const combatBusyRef = useRef(false);
  const effectIdRef = useRef(0);
  const cameraTweenRef = useRef(null);
  const previousFrameTimeRef = useRef(0);
  const stateRef = useLatestRef({ mode, playerData, entities, combatState, exploreState });

  useEffect(() => {
    const p = playerData.pos;
    const cameraPos = getCameraFocusPosition(worldMap, p.x, p.y, EXPLORE_CAMERA_Y_OFFSET);
    cameraRef.current.x = cameraPos.x;
    cameraRef.current.y = cameraPos.y;
  }, []);

  useEffect(() => {
    if (mode !== 'COMBAT') {
      combatBusyRef.current = false;
      combatEffectsRef.current = [];
    }
  }, [mode]);

  const tweenCameraTo = (targetPosition, duration = CAMERA_TWEEN_DURATION) => {
    cameraTweenRef.current = createTimedTween(
      { x: cameraRef.current.x, y: cameraRef.current.y },
      targetPosition,
      duration,
    );
  };

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
      heightMap: worldMap,
      worldSize: WORLD_SIZE,
    });

    combatBusyRef.current = false;
    combatEffectsRef.current = [];
    setCombatState(nextCombatState);
    setMode('COMBAT');
    tweenCameraTo(getCameraFocusPosition(worldMap, centerX, centerY, COMBAT_CAMERA_Y_OFFSET));
    showFloatText(centerX, centerY, '遭遇战!', '#ef4444');
  };

  const showFloatText = (x, y, text, color) => floatingTextsRef.current.push({ id: Date.now()+Math.random(), x, y, text, color, life: 60 });

  const createEffectId = () => {
    effectIdRef.current += 1;
    return effectIdRef.current;
  };

  const pushCombatEffect = (effect) => {
    combatEffectsRef.current.push({ id: createEffectId(), ...effect });
  };

  const collectAttackTargets = (units, attacker, targetX, targetY) => {
    const offsets = JOBS[attacker.job].aoe
      ? [{ dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }]
      : [{ dx: 0, dy: 0 }];

    return offsets.reduce((targets, offset) => {
      const unit = getCombatUnitAt(units, targetX + offset.dx, targetY + offset.dy);
      if (unit && unit.team !== attacker.team && !targets.find((target) => target.uid === unit.uid)) {
        targets.push(unit);
      }
      return targets;
    }, []);
  };

  const queueHitEffects = (target, attacker, startedAt = performance.now()) => {
    const direction = normalizeVector(target.x - attacker.x, target.y - attacker.y);

    pushCombatEffect({
      kind: 'hit',
      targetUid: target.uid,
      startedAt,
      endAt: startedAt + HIT_REACTION_DURATION,
      direction,
      origin: { x: target.x + 0.5, y: target.y + 0.5 },
    });
    pushCombatEffect({
      kind: 'blood',
      startedAt,
      endAt: startedAt + BLOOD_PARTICLE_DURATION,
      origin: { x: target.x + 0.5, y: target.y + 0.5 },
      direction,
      particles: createBloodParticles(direction),
    });
  };

  const buildAttackEffect = (attacker, targets, targetCell, startedAt = performance.now()) => {
    const style = getAttackStyle(attacker);
    const profile = ATTACK_PROFILES[style];
    const source = { x: attacker.x + 0.5, y: attacker.y + 0.5 };
    const impact = getAttackTargetCenter(targets, targetCell);
    const direction = normalizeVector(impact.x - source.x, impact.y - source.y);
    const travelMs = style === 'melee' ? profile.travelMs : profile.travelMs + Math.round(direction.length * 45);
    const impactAt = startedAt + profile.windupMs + travelMs;

    return {
      kind: 'attack',
      style,
      attackerUid: attacker.uid,
      attackerTeam: attacker.team,
      color: style === 'spell' ? JOBS[attacker.job].color : profile.accent,
      source,
      impact,
      direction,
      startedAt,
      windupMs: profile.windupMs,
      travelMs,
      settleMs: profile.settleMs,
      impactAt,
      endAt: impactAt + profile.settleMs,
      backstepDistance: profile.backstepDistance,
      lungeDistance: profile.lungeDistance,
      arcHeight: profile.arcHeight,
      targetUids: targets.map((target) => target.uid),
    };
  };

  const calculateDamage = (attacker, target) => {
    const attackerZ = getCellZ(worldMap, attacker.x, attacker.y);
    const targetZ = getCellZ(worldMap, target.x, target.y);
    let damage = attacker.atk;

    if (attacker.job === 'Archer' && attackerZ > targetZ) {
      damage += Math.floor((attackerZ - targetZ) * 6);
    }

    return Math.floor(damage * (0.85 + Math.random() * 0.3));
  };

  const startAttackSequence = ({ attackerUid, targetCell, targetUids = null }) => {
    const cState = stateRef.current.combatState;
    if (!cState) {
      return 0;
    }

    const attacker = cState.units.find((unit) => unit.uid === attackerUid && unit.hp > 0);
    if (!attacker) {
      return 0;
    }

    const targets = targetUids
      ? cState.units.filter((unit) => targetUids.includes(unit.uid) && unit.hp > 0 && unit.team !== attacker.team)
      : collectAttackTargets(cState.units, attacker, targetCell.x, targetCell.y);

    if (targets.length === 0) {
      setCombatState((prev) => (prev ? { ...prev, actionState: 'idle', hlCells: [] } : prev));
      return 0;
    }

    const startedAt = performance.now();
    const effect = buildAttackEffect(attacker, targets, targetCell, startedAt);
    const targetSet = new Set(effect.targetUids);
    const impactDelay = effect.impactAt - startedAt;
    const totalDelay = effect.endAt - startedAt + 60;

    combatBusyRef.current = true;
    pushCombatEffect(effect);

    setCombatState((prev) => {
      if (!prev) {
        return prev;
      }

      const nextUnits = prev.units.map((unit) => (unit.uid === attackerUid ? { ...unit, hasActed: true } : unit));
      return {
        ...prev,
        units: nextUnits,
        selectedUnit: syncSelectedUnitFromUnits(prev.selectedUnit, nextUnits),
        actionState: 'idle',
        hlCells: [],
        isResolving: true,
      };
    });

    window.setTimeout(() => {
      if (!stateRef.current.combatState) {
        combatBusyRef.current = false;
        return;
      }

      const impactTime = performance.now();
      setCombatState((prev) => {
        if (!prev) {
          return prev;
        }

        const actingUnit = prev.units.find((unit) => unit.uid === attackerUid && unit.hp > 0);
        if (!actingUnit) {
          return { ...prev, isResolving: false };
        }

        const nextUnits = prev.units.map((unit) => {
          if (!targetSet.has(unit.uid) || unit.hp <= 0 || unit.team === actingUnit.team) {
            return unit;
          }

          const damage = calculateDamage(actingUnit, unit);
          showFloatText(unit.x, unit.y, `-${damage}`, '#ef4444');
          queueHitEffects(unit, actingUnit, impactTime);
          return { ...unit, hp: Math.max(0, unit.hp - damage) };
        });

        return {
          ...prev,
          units: nextUnits,
          selectedUnit: syncSelectedUnitFromUnits(prev.selectedUnit, nextUnits),
        };
      });
    }, impactDelay);

    window.setTimeout(() => {
      combatBusyRef.current = false;
      if (!stateRef.current.combatState) {
        return;
      }

      setCombatState((prev) => (prev ? {
        ...prev,
        isResolving: false,
        selectedUnit: syncSelectedUnitFromUnits(prev.selectedUnit, prev.units),
      } : prev));
      checkBattleResult();
    }, totalDelay);

    return totalDelay;
  };

  const executeAttack = (targetX, targetY) => {
    const cState = stateRef.current.combatState;
    if (!cState || combatBusyRef.current) {
      return;
    }

    const attacker = cState.selectedUnit;
    if (!attacker) {
      return;
    }

    const targets = collectAttackTargets(cState.units, attacker, targetX, targetY);

    if (targets.length === 0) {
      setCombatState((prev) => (prev ? { ...prev, actionState: 'idle', hlCells: [] } : prev));
      return;
    }

    startAttackSequence({
      attackerUid: attacker.uid,
      targetCell: { x: targetX, y: targetY },
      targetUids: targets.map((target) => target.uid),
    });
  };

  const getCombatUnitPose = (unit, now) => {
    const pose = {
      gridOffsetX: 0,
      gridOffsetY: 0,
      liftY: 0,
      jitterX: 0,
      jitterY: 0,
      scaleX: 1,
      scaleY: 1,
      tilt: 0,
      flashAlpha: 0,
      auraAlpha: 0,
      auraColor: null,
      shadowScale: 1,
    };

    combatEffectsRef.current.forEach((effect) => {
      if (effect.kind === 'attack' && effect.attackerUid === unit.uid) {
        const elapsed = now - effect.startedAt;
        const recoverStart = effect.windupMs + effect.travelMs;
        const totalDuration = effect.endAt - effect.startedAt;

        if (elapsed < 0 || elapsed > totalDuration) {
          return;
        }

        if (elapsed <= effect.windupMs) {
          const progress = clamp(elapsed / effect.windupMs, 0, 1);
          const backstep = lerp(0, effect.backstepDistance, easeInOutCubic(progress));
          pose.gridOffsetX -= effect.direction.x * backstep;
          pose.gridOffsetY -= effect.direction.y * backstep;
          pose.liftY += Math.sin(progress * Math.PI) * (effect.style === 'spell' ? 8 : 4);
          pose.scaleX += 0.04 * progress;
          pose.scaleY -= 0.05 * progress;
          pose.tilt += (effect.direction.x - effect.direction.y) * 0.04 * progress;
          if (effect.style === 'spell') {
            pose.auraAlpha = Math.max(pose.auraAlpha, 0.2 + 0.35 * progress);
            pose.auraColor = effect.color;
          }
          return;
        }

        if (elapsed <= recoverStart) {
          const progress = clamp((elapsed - effect.windupMs) / effect.travelMs, 0, 1);
          const lunge = lerp(-effect.backstepDistance, effect.lungeDistance, easeOutBack(progress));
          pose.gridOffsetX += effect.direction.x * lunge;
          pose.gridOffsetY += effect.direction.y * lunge;
          pose.liftY += Math.sin(progress * Math.PI) * (effect.style === 'melee' ? 10 : 4);
          pose.tilt += (effect.direction.x - effect.direction.y) * (effect.style === 'melee' ? 0.1 : 0.05) * (1 - progress);
          if (effect.style === 'spell') {
            pose.auraAlpha = Math.max(pose.auraAlpha, 0.3 * (1 - progress));
            pose.auraColor = effect.color;
          }
          return;
        }

        const progress = clamp((elapsed - recoverStart) / effect.settleMs, 0, 1);
        const recoil = lerp(effect.style === 'melee' ? effect.lungeDistance : effect.lungeDistance * 0.4, 0, easeOutCubic(progress));
        pose.gridOffsetX += effect.direction.x * recoil;
        pose.gridOffsetY += effect.direction.y * recoil;
        pose.liftY += Math.sin((1 - progress) * Math.PI) * (effect.style === 'melee' ? 4 : 2);
        if (effect.style === 'spell') {
          pose.auraAlpha = Math.max(pose.auraAlpha, 0.15 * (1 - progress));
          pose.auraColor = effect.color;
        }
      }

      if (effect.kind === 'hit' && effect.targetUid === unit.uid) {
        const duration = effect.endAt - effect.startedAt;
        const progress = clamp((now - effect.startedAt) / duration, 0, 1);
        if (progress < 0 || progress > 1) {
          return;
        }

        const shock = Math.sin(progress * Math.PI * 8) * (1 - progress) * 4;
        pose.jitterX += effect.direction.x * shock + effect.direction.y * shock * 0.45;
        pose.jitterY += effect.direction.y * shock - effect.direction.x * shock * 0.45;
        pose.flashAlpha = Math.max(pose.flashAlpha, ((1 - progress) ** 1.2) * 0.55);
        pose.scaleX += 0.05 * (1 - progress);
        pose.scaleY -= 0.06 * (1 - progress);
        pose.shadowScale += 0.05 * (1 - progress);
      }
    });

    pose.shadowScale = clamp(pose.shadowScale, 0.78, 1.4);
    return pose;
  };

  const renderCombatEffects = (ctx, now) => {
    combatEffectsRef.current.forEach((effect) => {
      if (effect.kind === 'attack') {
        if (effect.style === 'melee') {
          const progress = clamp((now - (effect.startedAt + effect.windupMs * 0.6)) / Math.max(effect.travelMs, 1), 0, 1);
          if (progress > 0 && progress < 1) {
            const impactZ = getAnimatedCellZ(worldMap, effect.impact.x, effect.impact.y);
            const impactPos = toIso(effect.impact.x, effect.impact.y, impactZ);
            const screenDir = toIso(effect.impact.x + effect.direction.x * 0.2, effect.impact.y + effect.direction.y * 0.2, impactZ);
            const angle = Math.atan2(screenDir.cy - impactPos.cy, screenDir.cx - impactPos.cx);

            ctx.save();
            ctx.translate(impactPos.cx, impactPos.cy - 18);
            ctx.rotate(angle);
            ctx.globalAlpha = 0.18 + (1 - progress) * 0.45;
            ctx.strokeStyle = effect.color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 15 + progress * 12, -1.3, 0.55);
            ctx.stroke();
            ctx.restore();
          }
        }

        if (effect.style === 'arrow') {
          const releaseAt = effect.startedAt + effect.windupMs * 0.55;
          const travelProgress = clamp((now - releaseAt) / Math.max(effect.impactAt - releaseAt, 1), 0, 1);
          if (travelProgress > 0 && travelProgress < 1) {
            const projectileX = lerp(effect.source.x, effect.impact.x, travelProgress);
            const projectileY = lerp(effect.source.y, effect.impact.y, travelProgress);
            const nextProgress = clamp(travelProgress + 0.02, 0, 1);
            const nextX = lerp(effect.source.x, effect.impact.x, nextProgress);
            const nextY = lerp(effect.source.y, effect.impact.y, nextProgress);
            const groundZ = getAnimatedCellZ(worldMap, projectileX, projectileY);
            const nextGroundZ = getAnimatedCellZ(worldMap, nextX, nextY);
            const arc = effect.arcHeight * 4 * travelProgress * (1 - travelProgress);
            const nextArc = effect.arcHeight * 4 * nextProgress * (1 - nextProgress);
            const projectilePos = toIso(projectileX, projectileY, groundZ + arc);
            const nextPos = toIso(nextX, nextY, nextGroundZ + nextArc);
            const sourceGround = getAnimatedCellZ(worldMap, effect.source.x, effect.source.y);
            const sourcePos = toIso(effect.source.x, effect.source.y, sourceGround);
            const angle = Math.atan2(nextPos.cy - projectilePos.cy, nextPos.cx - projectilePos.cx);

            ctx.save();
            ctx.globalAlpha = 0.2;
            ctx.strokeStyle = 'rgba(251,191,36,0.55)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(sourcePos.cx, sourcePos.cy - 10);
            ctx.lineTo(projectilePos.cx, projectilePos.cy - 6);
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.translate(projectilePos.cx, projectilePos.cy - 8);
            ctx.rotate(angle);
            ctx.strokeStyle = '#fef3c7';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-10, 0);
            ctx.lineTo(6, 0);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(3, -4);
            ctx.lineTo(8, 0);
            ctx.lineTo(3, 4);
            ctx.stroke();
            ctx.restore();
          }
        }

        if (effect.style === 'spell') {
          const casterZ = getAnimatedCellZ(worldMap, effect.source.x, effect.source.y);
          const casterPos = toIso(effect.source.x, effect.source.y, casterZ);
          const windupProgress = clamp((now - effect.startedAt) / Math.max(effect.windupMs, 1), 0, 1);
          const travelProgress = clamp((now - (effect.startedAt + effect.windupMs * 0.55)) / Math.max(effect.impactAt - (effect.startedAt + effect.windupMs * 0.55), 1), 0, 1);
          const impactProgress = clamp((now - effect.impactAt) / Math.max(effect.settleMs, 1), 0, 1);

          if (windupProgress > 0 && windupProgress < 1) {
            for (let index = 0; index < 6; index += 1) {
              const angle = windupProgress * Math.PI * 2.6 + index * ((Math.PI * 2) / 6);
              const radius = 10 + windupProgress * 12;
              const x = casterPos.cx + Math.cos(angle) * radius;
              const y = casterPos.cy - 18 + Math.sin(angle) * radius * 0.55;

              ctx.save();
              ctx.globalAlpha = 0.18 + windupProgress * 0.35;
              ctx.fillStyle = index % 2 === 0 ? effect.color : '#f8fafc';
              ctx.beginPath();
              ctx.arc(x, y, 2.6 + windupProgress * 1.2, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
          }

          if (travelProgress > 0 && travelProgress < 1) {
            for (let index = 0; index < 5; index += 1) {
              const beadProgress = clamp(travelProgress - index * 0.08, 0, 1);
              if (beadProgress <= 0 || beadProgress >= 1) {
                continue;
              }

              const beadX = lerp(effect.source.x, effect.impact.x, beadProgress);
              const beadY = lerp(effect.source.y, effect.impact.y, beadProgress);
              const beadZ = getAnimatedCellZ(worldMap, beadX, beadY);
              const wobble = Math.sin(beadProgress * Math.PI * 4 + index) * 0.18;
              const beadPos = toIso(beadX - effect.direction.y * wobble, beadY + effect.direction.x * wobble, beadZ + effect.arcHeight * 0.7);

              ctx.save();
              ctx.globalAlpha = 0.12 + (1 - beadProgress) * 0.45;
              ctx.fillStyle = index % 2 === 0 ? effect.color : '#e9d5ff';
              ctx.beginPath();
              ctx.arc(beadPos.cx, beadPos.cy - 12, 4 - index * 0.45, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
          }

          if (impactProgress > 0 && impactProgress < 1) {
            const impactZ = getAnimatedCellZ(worldMap, effect.impact.x, effect.impact.y);
            const impactPos = toIso(effect.impact.x, effect.impact.y, impactZ + 0.8 * (1 - impactProgress));

            ctx.save();
            ctx.translate(impactPos.cx, impactPos.cy - 16);
            ctx.globalAlpha = 0.45 * (1 - impactProgress);
            ctx.strokeStyle = effect.color;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, 12 + impactProgress * 18, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            for (let index = 0; index < 6; index += 1) {
              const angle = index * ((Math.PI * 2) / 6) + impactProgress * 1.8;
              const radius = 6 + impactProgress * 16;
              const x = impactPos.cx + Math.cos(angle) * radius;
              const y = impactPos.cy - 16 + Math.sin(angle) * radius * 0.65;

              ctx.save();
              ctx.globalAlpha = 0.2 + (1 - impactProgress) * 0.35;
              ctx.fillStyle = index % 2 === 0 ? effect.color : '#f8fafc';
              ctx.beginPath();
              ctx.arc(x, y, 2.5, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
          }
        }
      }

      if (effect.kind === 'hit') {
        const duration = effect.endAt - effect.startedAt;
        const progress = clamp((now - effect.startedAt) / duration, 0, 1);
        if (progress > 0 && progress < 1) {
          const impactZ = getAnimatedCellZ(worldMap, effect.origin.x, effect.origin.y);
          const impactPos = toIso(effect.origin.x, effect.origin.y, impactZ);

          ctx.save();
          ctx.translate(impactPos.cx, impactPos.cy - 18);
          ctx.globalAlpha = 0.22 + (1 - progress) * 0.25;
          ctx.strokeStyle = '#f87171';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 12 + progress * 18, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      if (effect.kind === 'blood') {
        const duration = effect.endAt - effect.startedAt;
        const progress = clamp((now - effect.startedAt) / duration, 0, 1);
        if (progress > 0 && progress < 1) {
          effect.particles.forEach((particle, index) => {
            const worldX = effect.origin.x + particle.xBias + particle.vx * progress * 4;
            const worldY = effect.origin.y + particle.yBias + particle.vy * progress * 4;
            const baseZ = getAnimatedCellZ(worldMap, worldX, worldY);
            const lift = particle.lift * Math.sin(progress * Math.PI);
            const point = toIso(worldX, worldY, baseZ + lift);

            ctx.save();
            ctx.globalAlpha = ((1 - progress) ** 1.4) * (0.3 + (index % 4) * 0.1);
            ctx.fillStyle = index % 3 === 0 ? '#7f1d1d' : '#ef4444';
            ctx.beginPath();
            ctx.arc(point.cx, point.cy - 8, particle.size * (1 - progress * 0.35), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          });
        }
      }
    });
  };

  const checkBattleResult = () => {
    const cState = stateRef.current.combatState;
    if (!cState) {
      return;
    }

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
      combatState.units.filter(u => u.team === 'enemy' && u.hp > 0).forEach((enemy) => {
        setTimeout(() => {
          const currentState = stateRef.current.combatState;
          if (!currentState || currentState.turn !== 'enemy') {
            return;
          }

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
            const latestState = stateRef.current.combatState;
            if (!latestState || latestState.turn !== 'enemy') {
              return;
            }

            const updatedEnemy = latestState.units.find((unit) => unit.uid === enemy.uid && unit.hp > 0);
            if (!updatedEnemy) {
              setTimeout(() => checkBattleResult(), 0);
              return;
            }

            const target = latestState.units.find(
              (unit) => unit.team === 'player' && unit.hp > 0 && Math.abs(unit.x - updatedEnemy.x) + Math.abs(unit.y - updatedEnemy.y) <= updatedEnemy.range,
            );

            if (target) {
              startAttackSequence({
                attackerUid: updatedEnemy.uid,
                targetCell: { x: target.x, y: target.y },
                targetUids: collectAttackTargets(latestState.units, updatedEnemy, target.x, target.y).map((unit) => unit.uid),
              });
              return;
            }

            setCombatState((currState) => {
              if (!currState) {
                return currState;
              }

              const nextUnits = currState.units.map((unit) => (unit.uid === enemy.uid ? { ...unit, hasActed: true } : unit));
              return {
                ...currState,
                units: nextUnits,
                selectedUnit: syncSelectedUnitFromUnits(currState.selectedUnit, nextUnits),
              };
            });
            setTimeout(() => checkBattleResult(), 120);
          }, attackDelay);
        }, delay);
        delay += ENEMY_ACTION_INTERVAL;
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
        cameraTweenRef.current = null;
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
    if (st.mode === 'COMBAT' && (combatBusyRef.current || st.combatState?.isResolving)) return;

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

    for (let i = renderables.length - 1; i >= 0; i--) {
      const item = renderables[i];
      if (item.type !== 'cell') {
        continue;
      }

      const { x: gx, y: gy } = item;
      const z0 = worldMap[gx][gy], z1 = worldMap[gx+1][gy], z2 = worldMap[gx+1][gy+1], z3 = worldMap[gx][gy+1];
      const p0 = toIso(gx, gy, z0), p1 = toIso(gx+1, gy, z1), p2 = toIso(gx+1, gy+1, z2), p3 = toIso(gx, gy+1, z3);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.moveTo(cx + p0.cx * zoom, cy + p0.cy * zoom);
      ctx.lineTo(cx + p1.cx * zoom, cy + p1.cy * zoom);
      ctx.lineTo(cx + p2.cx * zoom, cy + p2.cy * zoom);
      ctx.lineTo(cx + p3.cx * zoom, cy + p3.cy * zoom);
      ctx.closePath();
      if (ctx.isPointInPath(x, y)) {
        clickedCell = {x: item.x, y: item.y};
        break;
      }
    }

    if (!clickedCell) {
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
      if (!cState || combatBusyRef.current || cState.isResolving) return;
      const clickedUnit = getCombatUnitAt(cState.units, tx, ty);
      if (cState.actionState === 'moving') {
        if (cState.hlCells.find(c=>c.x===tx && c.y===ty)) {
          setCombatState((p) => {
            if (!p) {
              return p;
            }

            const nextUnits = p.units.map((u) => (u.uid === p.selectedUnit.uid ? { ...u, x:tx, y:ty, hasMoved:true } : u));
            return {
              ...p,
              actionState:'idle',
              hlCells:[],
              units: nextUnits,
              selectedUnit: syncSelectedUnitFromUnits(p.selectedUnit, nextUnits),
            };
          });
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
    if (combatBusyRef.current || stateRef.current.combatState?.isResolving) {
      return;
    }
    setCombatState((prev) => ({ ...prev, selectedUnit: null, actionState: 'idle', hlCells: [] }));
  };

  const toggleCombatMovement = () => {
    if (combatBusyRef.current) {
      return;
    }

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
    if (combatBusyRef.current) {
      return;
    }

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
    if (combatBusyRef.current) {
      return;
    }

    const selectedUnit = stateRef.current.combatState?.selectedUnit;
    setPlayerData((prev) => ({ ...prev, potions: prev.potions - 1 }));
    setCombatState((prev) => {
      if (!prev) {
        return prev;
      }

      const nextUnits = prev.units.map((unit) => (
        unit.uid === prev.selectedUnit.uid ? { ...unit, hp: Math.min(unit.maxHp, unit.hp + 50), hasActed: true } : unit
      ));
      return {
        ...prev,
        actionState: 'idle',
        hlCells: [],
        units: nextUnits,
        selectedUnit: syncSelectedUnitFromUnits(prev.selectedUnit, nextUnits),
      };
    });
    if (selectedUnit) {
      showFloatText(selectedUnit.x, selectedUnit.y, '+50', '#4ade80');
    }
    setTimeout(checkBattleResult, 100);
  };

  const standbySelectedUnit = () => {
    if (combatBusyRef.current) {
      return;
    }

    setCombatState((prev) => {
      if (!prev) {
        return prev;
      }

      const nextUnits = prev.units.map((unit) => (unit.uid === prev.selectedUnit.uid ? { ...unit, hasMoved: true, hasActed: true } : unit));
      return {
        ...prev,
        units: nextUnits,
        selectedUnit: null,
        actionState: 'idle',
        hlCells: [],
      };
    });
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
      const deltaMs = previousFrameTimeRef.current ? now - previousFrameTimeRef.current : 0;
      previousFrameTimeRef.current = now;
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, canvas.width, canvas.height);

      const st = stateRef.current;
      const activeTweenKeys = new Set(['player_leader']);
      const playerDisplayPos = syncTweenTarget(motionTweensRef.current, 'player_leader', st.playerData.pos, now);

      if (st.mode === 'EXPLORE') {
        cameraTweenRef.current = null;
        const cameraFocusTarget = getCameraFocusPosition(worldMap, playerDisplayPos.x, playerDisplayPos.y, EXPLORE_CAMERA_Y_OFFSET);
        const currentCameraFollow = {
          x: cameraRef.current.x - cameraOffsetRef.current.x,
          y: cameraRef.current.y - cameraOffsetRef.current.y,
        };
        const cameraFollowPos = dampTowards(currentCameraFollow, cameraFocusTarget, deltaMs);
        cameraRef.current.x = cameraFollowPos.x + cameraOffsetRef.current.x;
        cameraRef.current.y = cameraFollowPos.y + cameraOffsetRef.current.y;
      } else if (cameraTweenRef.current) {
        const tweenedCameraPos = getTweenPosition(cameraTweenRef.current, now);
        cameraRef.current.x = tweenedCameraPos.x;
        cameraRef.current.y = tweenedCameraPos.y;

        if (hasTweenArrived(tweenedCameraPos, cameraTweenRef.current)) {
          cameraRef.current.x = cameraTweenRef.current.toX;
          cameraRef.current.y = cameraTweenRef.current.toY;
          cameraTweenRef.current = null;
        }
      }

      ctx.save();
      const { x: camX, y: camY, zoom } = cameraRef.current;
      const cx = canvas.width/2 + camX; const cy = canvas.height/2 + camY;
      ctx.translate(cx, cy); ctx.scale(zoom, zoom);

      const renderList = [];
      const combatBoundary = st.mode === 'COMBAT' && st.combatState ? st.combatState.boundary : null;

      for (let x = 0; x < WORLD_SIZE; x++) {
        for (let y = 0; y < WORLD_SIZE; y++) {
          const z = getCellZ(worldMap, x, y);
          const pos = toIso(x+0.5, y+0.5, z);
          if (cx + pos.cx*zoom < -150 || cx + pos.cx*zoom > canvas.width+150 || cy + pos.cy*zoom < -150 || cy + pos.cy*zoom > canvas.height+150) continue;
          const cellOpacity = combatBoundary ? getCombatCellOpacity(x, y, combatBoundary) : 1;
          if (cellOpacity <= TWEEN_EPSILON) continue;
          
          renderList.push({ type: 'cell', x, y, z: x+y, opacity: cellOpacity });
          const ent = st.entities.find(e => e.x === x && e.y === y);
          const isCurrentEncounterEntity = Boolean(st.mode === 'COMBAT' && st.combatState && ent && ent.id === st.combatState.enemyEntId);
          if (ent && !isCurrentEncounterEntity) {
            const entityOpacity = combatBoundary ? cellOpacity * COMBAT_DIMMED_ENTITY_ALPHA : 1;
            if (entityOpacity > TWEEN_EPSILON) {
              renderList.push({ type: 'entity', ent, z: x+y+0.5, opacity: entityOpacity, dimmed: Boolean(combatBoundary) });
            }
          }
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
      combatEffectsRef.current = combatEffectsRef.current.filter((effect) => effect.endAt > now);

      renderList.sort((a, b) => a.z - b.z);
      renderablesRef.current = renderList; 

      renderList.forEach(item => {
        if (item.type === 'cell') {
          const { x, y, opacity } = item;
          const z0 = worldMap[x][y], z1 = worldMap[x+1][y], z2 = worldMap[x+1][y+1], z3 = worldMap[x][y+1];
          const avgZ = (z0+z1+z2+z3)/4;
          const p0 = toIso(x, y, z0), p1 = toIso(x+1, y, z1), p2 = toIso(x+1, y+1, z2), p3 = toIso(x, y+1, z3);

          ctx.beginPath();
          ctx.moveTo(p0.cx, p0.cy); ctx.lineTo(p1.cx, p1.cy); ctx.lineTo(p2.cx, p2.cy); ctx.lineTo(p3.cx, p3.cy);
          ctx.closePath();

          ctx.save();
          ctx.globalAlpha = opacity;
          ctx.fillStyle = getTerrainColor(avgZ);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();
          ctx.restore();

          if (
            combatBoundary
            && x >= combatBoundary.minX && x <= combatBoundary.maxX
            && y >= combatBoundary.minY && y <= combatBoundary.maxY
            && (x === combatBoundary.minX || x === combatBoundary.maxX || y === combatBoundary.minY || y === combatBoundary.maxY)
          ) {
            ctx.save();
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = COLORS.combatBoundary;
            ctx.fill();
            ctx.strokeStyle = 'rgba(251,191,36,0.3)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
          }

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
          const { ent, opacity, dimmed } = item;
          if (opacity <= TWEEN_EPSILON) return;

          const z = getCellZ(worldMap, ent.x, ent.y);
          const pos = toIso(ent.x+0.5, ent.y+0.5, z);
          ctx.save(); ctx.translate(pos.cx, pos.cy - 15);
          ctx.globalAlpha = opacity;
          if (dimmed) {
            ctx.filter = COMBAT_ENTITY_FILTER;
          }
          
          if(ent.type === 'shrine' || ent.type === 'village') {
            ctx.fillStyle = dimmed ? '#e2e8f0' : 'white';
            ctx.font = '30px Arial'; ctx.textAlign = 'center'; ctx.fillText(ent.icon, 0, 0);
            ctx.fillStyle = dimmed ? '#94a3b8' : 'white'; ctx.font = '12px Arial'; ctx.fillText(ent.name, 0, 18);
          } else {
             ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 15, 12, 6, 0, 0, Math.PI*2); ctx.fill();
             ctx.fillStyle = dimmed ? '#64748b' : ent.type === 'enemy_patrol' ? '#ef4444' : '#fbbf24';
             ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI*2); ctx.fill();
             ctx.fillStyle = dimmed ? '#e2e8f0' : 'white'; ctx.font='16px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(ent.icon, 0, 0);
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
          const job = JOBS[unit.job];
          const pose = getCombatUnitPose(unit, now);
          const animatedPos = {
            x: item.displayPos.x + pose.gridOffsetX,
            y: item.displayPos.y + pose.gridOffsetY,
          };
          const z = getAnimatedCellZ(worldMap, animatedPos.x, animatedPos.y);
          const pos = toIso(animatedPos.x+0.5, animatedPos.y+0.5, z);
          
          ctx.save();
          ctx.translate(pos.cx + pose.jitterX, pos.cy - 12 + pose.jitterY - pose.liftY);
          ctx.rotate(pose.tilt);
          ctx.scale(pose.scaleX, pose.scaleY);

          if (pose.auraAlpha > 0) {
            ctx.save();
            ctx.globalAlpha = pose.auraAlpha;
            ctx.strokeStyle = pose.auraColor ?? job.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, -15, 24 + Math.sin(now / 80) * 2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 12, 16 * pose.shadowScale, 8 * pose.shadowScale, 0, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(0, -15, 20, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = (unit.hasMoved && unit.hasActed) ? '#64748b' : job.color;
          ctx.beginPath(); ctx.arc(0, -15, 16, 0, Math.PI*2); ctx.fill();
          if (pose.flashAlpha > 0) {
            ctx.fillStyle = `rgba(248, 113, 113, ${pose.flashAlpha})`;
            ctx.beginPath(); ctx.arc(0, -15, 16, 0, Math.PI * 2); ctx.fill();
          }
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

      renderCombatEffects(ctx, now);

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