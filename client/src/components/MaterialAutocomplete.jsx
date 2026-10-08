import { useState, useRef, useEffect } from 'react';
import { Plus, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { matchesSearchFields } from '../utils/search';

export default function MaterialAutocomplete({
  materials,
  onMaterialsChange,
  value,
  materialId,
  onChange,
  required,
  labelClassName,
  inputClassName,
  compact = false,
}) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapperRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    setHighlight(-1);
  }, [query, materials]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const trimmed = query.trim();
  const suggestions = trimmed
    ? materials.filter((m) => matchesSearchFields(m, ['name', 'nameTelugu'], trimmed))
    : materials;

  const exactMatch = materials.some((m) => m.name.toLowerCase() === trimmed.toLowerCase());
  const showAddOption = trimmed.length > 0 && !exactMatch;
  const totalOptionsCount = suggestions.length + (showAddOption ? 1 : 0);

  useEffect(() => {
    if (!open || highlight < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const selectMaterial = (mat) => {
    onChange({
      materialId: mat._id,
      materialName: mat.name,
      sellingPricePerKg: mat.sellingPricePerKg,
    });
    setQuery(mat.name);
    setOpen(false);
    setHighlight(-1);
  };

  const handleAddNew = async () => {
    if (!trimmed) return;
    setAdding(true);
    try {
      const res = await api.post('/materials', { name: trimmed });
      const newMat = res.data;
      onMaterialsChange([...materials, newMat].sort((a, b) => a.name.localeCompare(b.name)));
      selectMaterial(newMat);
      toast.success(`"${trimmed}" added`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add material');
    } finally {
      setAdding(false);
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange({ materialId: '', materialName: val });
    setOpen(true);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      if (totalOptionsCount === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h < 0 ? 0 : Math.min(h + 1, totalOptionsCount - 1)));
      return;
    }

    if (e.key === 'ArrowUp') {
      if (totalOptionsCount === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h <= 0 ? 0 : h - 1));
      return;
    }

    if (e.key === 'Enter' && open) {
      if (totalOptionsCount === 0) return;
      e.preventDefault();
      const idx = highlight >= 0 ? highlight : 0;
      if (idx < suggestions.length) {
        selectMaterial(suggestions[idx]);
      } else if (showAddOption && idx === suggestions.length) {
        handleAddNew();
      }
      return;
    }

    if (e.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label className={labelClassName || (compact ? "text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block" : "label")}>
        Material Name *
      </label>
      <input
        className={inputClassName || (compact ? "h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-xs text-primary-700 placeholder:text-primary-300 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition" : "input-field")}
        placeholder="Type material name..."
        value={query}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        required={required}
        autoComplete="off"
      />

      {materialId && (
        <span className={`absolute right-2.5 ${compact ? 'top-[24px]' : 'top-[38px]'} text-primary-600`}>
          <Check className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
        </span>
      )}

      {open && (suggestions.length > 0 || showAddOption) && (
        <div
          ref={listRef}
          className="absolute z-20 left-0 right-0 mt-1 bg-surface border border-primary-200 rounded-lg shadow-card max-h-48 overflow-y-auto"
        >
          {suggestions.map((mat, idx) => (
            <button
              key={mat._id}
              type="button"
              data-idx={idx}
              onClick={() => selectMaterial(mat)}
              onMouseEnter={() => setHighlight(idx)}
              className={`w-full text-left px-3 py-1.5 transition text-xs text-primary-800 ${
                idx === highlight || (highlight < 0 && materialId === mat._id)
                  ? 'bg-primary-100 font-semibold text-primary-900'
                  : 'hover:bg-primary-50'
              }`}
            >
              {mat.name}
              {mat.nameTelugu ? <span className="text-primary-400 ml-1.5 text-[11px]">({mat.nameTelugu})</span> : null}
            </button>
          ))}

          {showAddOption && (
            <button
              type="button"
              data-idx={suggestions.length}
              onClick={handleAddNew}
              onMouseEnter={() => setHighlight(suggestions.length)}
              disabled={adding}
              className={`w-full text-left px-3 py-1.5 border-t border-primary-100 font-medium text-xs flex items-center gap-1.5 ${
                highlight === suggestions.length
                  ? 'bg-accent-100 text-primary-900'
                  : 'hover:bg-accent-50 text-primary-700'
              }`}
            >
              <Plus className="w-3.5 h-3.5 text-accent-500" />
              {adding ? 'Adding...' : `Add "${trimmed}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
