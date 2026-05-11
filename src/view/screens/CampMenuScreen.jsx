import { GEMS, JOBS } from '../../data/gameData.js';

export default function CampMenuScreen({ playerData, calcUnitStats, onClose, onToggleGem }) {
  return (
    <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md z-40 flex flex-col p-4 md:p-8" onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex justify-between items-center mb-6 text-white">
        <h1 className="text-3xl font-bold">营地与装备</h1>
        <button className="text-4xl hover:text-red-400 transition" onClick={onClose}>✕</button>
      </div>

      <div className="bg-slate-800/50 rounded-2xl p-4 mb-6 border border-slate-600 text-white flex justify-between">
        <div>
          <div className="text-slate-400 text-sm">小队总资产</div>
          <div className="font-bold text-xl">🪙 {playerData.gold}G | 🧪药水x{playerData.potions}</div>
        </div>
        <div className="text-right">
          <div className="text-slate-400 text-sm">剩余未镶嵌宝石</div>
          <div className="font-bold text-xl">🔴红宝石x{playerData.inventory.ruby || 0} | 🟢绿宝石x{playerData.inventory.emerald || 0}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 overflow-y-auto pb-10">
        {playerData.party.map((partyMember, partyIndex) => {
          const job = JOBS[partyMember.job];
          const finalStats = calcUnitStats(partyMember);

          return (
            <div key={partyMember.id} className="bg-white rounded-3xl p-5 shadow-xl flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shadow-inner text-white" style={{ backgroundColor: job.color }}>
                  {job.icon}
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800">
                    {job.name} <span className="text-sm font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full ml-1">Lv.{partyMember.level}</span>
                  </h2>
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
                  {[0, 1].map((slotIndex) => {
                    const gemId = partyMember.enchantSlots[slotIndex];
                    return (
                      <div
                        key={`${partyMember.id}-${slotIndex}`}
                        className="w-10 h-10 border-2 border-dashed border-slate-400 rounded-lg flex items-center justify-center cursor-pointer hover:bg-slate-100 bg-slate-50 transition"
                        onClick={() => onToggleGem(partyIndex, slotIndex, gemId)}
                      >
                        {gemId ? <span className="text-xl">{GEMS[gemId].icon}</span> : <span className="text-slate-300">+</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}