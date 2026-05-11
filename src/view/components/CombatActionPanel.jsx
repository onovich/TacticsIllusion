import { JOBS } from '../../data/gameData.js';

export default function CombatActionPanel({ combatState, potions, onClearSelection, onToggleMove, onToggleAttack, onUsePotion, onStandby }) {
  if (!combatState?.selectedUnit) {
    return null;
  }

  const { selectedUnit } = combatState;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-11/12 max-w-md" onPointerDown={(event) => event.stopPropagation()}>
      <div className="bg-white/95 backdrop-blur-xl rounded-3xl p-4 shadow-2xl flex flex-col gap-3 border border-white/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl text-white ${selectedUnit.team === 'player' ? 'bg-blue-500' : 'bg-red-500'}`}>
              {JOBS[selectedUnit.job].icon}
            </div>
            <div>
              <h3 className="font-bold text-slate-800">
                {JOBS[selectedUnit.job].name} <span className="text-xs text-slate-400">Lv.{selectedUnit.level}</span>
              </h3>
              <div className="text-xs font-semibold text-slate-500">HP: {selectedUnit.hp}/{selectedUnit.maxHp} | 攻: {selectedUnit.atk}</div>
            </div>
          </div>
          <button className="w-8 h-8 bg-slate-100 rounded-full text-slate-500" onClick={onClearSelection}>✕</button>
        </div>

        {selectedUnit.team === 'player' && combatState.turn === 'player' && (
          <div className="flex gap-2 mt-2">
            <button
              disabled={selectedUnit.hasMoved}
              className={`flex-1 py-2 rounded-xl font-bold ${selectedUnit.hasMoved ? 'bg-slate-100 text-slate-400' : combatState.actionState === 'moving' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'}`}
              onClick={onToggleMove}
            >
              移动
            </button>
            <button
              disabled={selectedUnit.hasActed}
              className={`flex-1 py-2 rounded-xl font-bold ${selectedUnit.hasActed ? 'bg-slate-100 text-slate-400' : combatState.actionState === 'attacking' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700'}`}
              onClick={onToggleAttack}
            >
              攻击
            </button>
            <button
              disabled={selectedUnit.hasActed || potions <= 0}
              className="flex-1 py-2 rounded-xl font-bold bg-green-100 text-green-700 disabled:opacity-50"
              onClick={onUsePotion}
            >
              喝药({potions})
            </button>
            <button className="flex-1 py-2 rounded-xl font-bold bg-slate-100 text-slate-700" onClick={onStandby}>
              待机
            </button>
          </div>
        )}
      </div>
    </div>
  );
}