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
  const [highlight, setHighlight] = useState(-1);
  const wrapperRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    setQuery(materialName || '');
  }, [materialName]);

  useEffect(() => {
    setHighlight(-1);
  }, [query, materials]);

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

  useEffect(() => {
    if (!open || highlight < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const selectMaterial = (mat) => {
    onChange({
      materialId: mat._id,
      materialName: mat.name,
      pricePerKg: mat.sellingPricePerKg,
    });
    setQuery(mat.name);
    setOpen(false);
    setHighlight(-1);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange({ materialId: '', materialName: val, pricePerKg: '' });
    setOpen(true);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h < 0 ? 0 : Math.min(h + 1, suggestions.length - 1)));
      return;
    }

    if (e.key === 'ArrowUp') {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h <= 0 ? 0 : h - 1));
      return;
    }

    if (e.key === 'Enter' && open) {
      if (suggestions.length === 0) return;
      e.preventDefault();
      const mat = suggestions[highlight >= 0 ? highlight : 0];
      if (mat) selectMaterial(mat);
      return;
    }

    if (e.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
    }
  };

  return (
    <div ref={wrapperRef} className="relative min-w-0">
      <input
        className="input-field !py-1.5 !px-2 !text-sm w-full min-w-0"
        placeholder="Type material..."
        value={query}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />

      {open && suggestions.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-30 left-0 right-0 mt-1 bg-surface border border-primary-200 rounded-lg shadow-card max-h-48 overflow-y-auto"
        >
          {suggestions.map((mat, idx) => (
            <button
              key={mat._id}
              type="button"
              data-idx={idx}
              onClick={() => selectMaterial(mat)}
              onMouseEnter={() => setHighlight(idx)}
              className={`w-full text-left px-3 py-2 transition text-sm ${
                idx === highlight || (highlight < 0 && materialId === mat._id)
                  ? 'bg-primary-100 font-medium text-primary-900'
                  : 'text-primary-600 hover:bg-primary-50'
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
