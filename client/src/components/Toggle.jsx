export default function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div className="relative">
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <div
          className={`w-14 h-8 rounded-full transition-colors ${checked ? 'bg-primary-500' : 'bg-primary-200'}`}
        />
        <div
          className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-0'
          }`}
        />
      </div>
      {label && <span className="text-base font-medium text-primary-700">{label}</span>}
    </label>
  );
}
