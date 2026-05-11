export default function TopHud({ mode, level, gold, onOpenMenu }) {
  return (
    <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none z-10">
      <div className="bg-slate-800/90 backdrop-blur text-white px-4 py-2 rounded-2xl shadow-lg border border-slate-700 flex gap-4 pointer-events-auto">
        <div className="flex flex-col">
          <span className="text-xs text-slate-400">小队等级</span>
          <span className="font-bold text-lg text-yellow-400">Lv.{level}</span>
        </div>
        <div className="w-px bg-slate-600"></div>
        <div className="flex flex-col">
          <span className="text-xs text-slate-400">金币</span>
          <span className="font-bold text-lg text-yellow-400">🪙 {gold}</span>
        </div>
      </div>

      {mode === 'EXPLORE' && (
        <button
          className="bg-blue-600/90 hover:bg-blue-500 backdrop-blur text-white p-3 rounded-full shadow-lg border border-blue-400 pointer-events-auto flex items-center gap-2 transition active:scale-95"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onOpenMenu}
        >
          <span className="text-xl">🎒</span>
          <span className="font-bold pr-2 hidden sm:inline">队伍与附魔</span>
        </button>
      )}
    </div>
  );
}