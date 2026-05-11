export default function DialogScreen({ dialogData, onBuyPotion, onClose }) {
  if (!dialogData) {
    return null;
  }

  return (
    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-30 flex items-center justify-center p-4" onPointerDown={(event) => event.stopPropagation()}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl relative">
        <h2 className="text-2xl font-bold mb-4">{dialogData.name}</h2>
        <p className="text-slate-600 text-lg mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">{dialogData.text}</p>
        {dialogData.type === 'shop' && (
          <div className="flex flex-col gap-3 mb-6">
            <button className="flex justify-between p-3 bg-blue-50 hover:bg-blue-100 rounded-xl font-bold text-blue-800" onClick={onBuyPotion}>
              <span>🧪 恢复药水 (群体回血50)</span>
              <span>🪙 50</span>
            </button>
          </div>
        )}
        <button className="w-full py-3 bg-slate-800 text-white font-bold rounded-xl active:scale-95 transition" onClick={onClose}>离开</button>
      </div>
    </div>
  );
}