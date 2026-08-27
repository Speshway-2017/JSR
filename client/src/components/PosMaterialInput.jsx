import { useState, useRef, useEffect } from 'react';
import { formatCurrency } from '../utils/format';
import { matchesSearchFields } from '../utils/search';

export default function PosMaterialInput({
  materials,
  materialId,
  materialName,
  excludeIds = [],
  onChange,
}) {
  const [query, setQuery] = useState(materialName || '');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    setQuery(materialName || '');
  }, [materialName]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        if (materialId && query !== materialName) {
          setQuery(materialName || '');
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [materialId, materialName, query]);

  const available = materials.filter(
    (m) => !excludeIds.includes(m._id) || m._id === materialId
  );

  const trimmed = query.trim();
  const suggestions = trimmed
    ? available.filter((m) => matchesSearchFields(m, ['name', 'nameTelugu'], trimmed))
    : available;

  const selectMaterial = (mat) => {
    onChange({
      materialId: mat._id,
      materialName: mat.name,
      pricePerKg: mat.sellingPricePerKg,
    });
    setQuery(mat.name);
    setOpen(false);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange({ materialId: '', materialName: val, pricePerKg: '' });
    setOpen(true);
  };

  return (
    <div ref={wrapperRef} className="relative min-w-0">
      <input
        className="input-field !py-1.5 !px-2 !text-sm w-full min-w-0"
        placeholder="Type material..."
        value={query}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />

      {open && suggestions.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-surface border border-primary-200 rounded-lg shadow-card max-h-48 overflow-y-auto">
          {suggestions.map((mat) => (
            <button
              key={mat._id}
              type="button"
              onClick={() => selectMaterial(mat)}
              className={`w-full text-left px-3 py-2 hover:bg-primary-50 transition text-sm ${
                materialId === mat._id ? 'bg-primary-50 font-medium text-primary-700' : 'text-primary-600'
              }`}
            >
              <span className="font-medium text-primary-700">{mat.name}</span>
              <span className="text-primary-400 ml-2 text-xs">
                {formatCurrency(mat.sellingPricePerKg)}/kg · {mat.availableKg || 0} kg
              </span>
            </button>
          ))}
        </div>
      )}

      {open && trimmed && suggestions.length === 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-surface border border-primary-200 rounded-lg shadow-card px-3 py-2 text-xs text-primary-400">
          No matching materials
        </div>
      )}
    </div>
  );
}
