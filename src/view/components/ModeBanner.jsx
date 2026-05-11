export default function ModeBanner({ mode, exploreState, combatState }) {
  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
      {mode === 'EXPLORE' && !exploreState.isSelected && <div className="bg-black/50 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-lg border border-white/10">点击有光圈的主角以探索</div>}
      {mode === 'EXPLORE' && exploreState.isSelected && <div className="bg-blue-600/80 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-lg animate-bounce">请点击发光的白色区域移动</div>}
      {mode === 'COMBAT' && combatState?.turn === 'player' && <div className="bg-red-600/80 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-[0_0_15px_rgba(220,38,38,0.5)]">⚔️ 玩家回合 - 请下达指令</div>}
      {mode === 'COMBAT' && combatState?.turn === 'enemy' && <div className="bg-slate-800/80 text-white px-4 py-1.5 rounded-full text-sm font-bold">🛡️ 敌方行动中...</div>}
    </div>
  );
}