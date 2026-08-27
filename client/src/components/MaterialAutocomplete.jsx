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
}) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

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

  const selectMaterial = (mat) => {
    onChange({
      materialId: mat._id,
      materialName: mat.name,
      sellingPricePerKg: mat.sellingPricePerKg,
    });
    setQuery(mat.name);
    setOpen(false);
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

  return (
    <div ref={wrapperRef} className="relative">
      <label className="label">Material Name *</label>
      <input
        className="input-field"
        placeholder="Type material name..."
        value={query}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        required={required}
        autoComplete="off"
      />

      {materialId && (
        <span className="absolute right-3 top-[38px] text-primary-500">
          <Check className="w-5 h-5" />
        </span>
      )}

      {open && (suggestions.length > 0 || showAddOption) && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-surface border border-primary-200 rounded-xl shadow-card max-h-56 overflow-y-auto">
          {suggestions.map((mat) => (
            <button
              key={mat._id}
              type="button"
              onClick={() => selectMaterial(mat)}
              className={`w-full text-left px-4 py-3 hover:bg-primary-50 transition text-primary-800 ${
                materialId === mat._id ? 'bg-primary-50 font-semibold' : ''
              }`}
            >
              {mat.name}
            </button>
          ))}

          {showAddOption && (
            <button
              type="button"
              onClick={handleAddNew}
              disabled={adding}
              className="w-full text-left px-4 py-3 border-t border-primary-100 hover:bg-accent-50 text-primary-700 font-medium flex items-center gap-2"
            >
              <Plus className="w-4 h-4 text-accent-400" />
              {adding ? 'Adding...' : `Add "${trimmed}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
