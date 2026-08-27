import { useCallback, useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatDate } from '../utils/format';
import { matchesSearchFields } from '../utils/search';
import { useDataRestored } from '../utils/useDataRestored';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function AddLoad() {
  const [vendors, setVendors] = useState([]);
  const [vendorQuery, setVendorQuery] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [loadDate, setLoadDate] = useState(todayInputValue());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [recent, setRecent] = useState([]);

  const selected = vendors.find((v) => v._id === vendorId);

  const suggestions = useMemo(() => {
    if (!vendorQuery.trim()) return [];
    return vendors
      .filter((v) => matchesSearchFields(v, ['name', 'nameTelugu', 'city', 'mobile'], vendorQuery))
      .slice(0, 8);
  }, [vendors, vendorQuery]);

  const loadRecent = useCallback(() => {
    api.get('/loads').then((res) => setRecent(res.data.slice(0, 20))).catch(() => {});
  }, []);

  const loadAll = useCallback(() => {
    api.get('/vendors').then((res) => setVendors(res.data)).catch(() => toast.error('Failed to load vendors'));
    loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useDataRestored(loadAll);

  const pickVendor = (v) => {
    setVendorId(v._id);
    setVendorQuery(v.name);
    setSuggestOpen(false);
    setHighlight(-1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!vendorId) {
      toast.error('Type and select a vendor');
      return;
    }
    if (!loadDate) {
      toast.error('Select load date');
      return;
    }

    setSaving(true);
    try {
      await api.post('/loads', {
        vendorId,
        loadDate,
        notes,
      });
      toast.success('Load recorded for this date');
      setVendorId('');
      setVendorQuery('');
      setNotes('');
      loadRecent();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save load');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="page-title">Add Load</h1>
        <p className="text-primary-400 text-sm mt-0.5">
          Record that a vendor brought a load on a date (for Sale Patty). Not a purchase.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="label">Date *</label>
          <input
            type="date"
            className="input-field"
            value={loadDate}
            onChange={(e) => setLoadDate(e.target.value)}
            required
          />
        </div>

        <div className="relative">
          <label className="label">Vendor *</label>
          <input
            className="input-field"
            value={vendorQuery}
            placeholder="Type vendor name…"
            autoComplete="off"
            onChange={(e) => {
              setVendorQuery(e.target.value);
              setVendorId('');
              setSuggestOpen(true);
            }}
            onFocus={() => {
              if (vendorQuery.trim()) setSuggestOpen(true);
            }}
            onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && suggestions.length) {
                e.preventDefault();
                setSuggestOpen(true);
                setHighlight((h) => (h < 0 ? 0 : Math.min(h + 1, suggestions.length - 1)));
              } else if (e.key === 'ArrowUp' && suggestions.length) {
                e.preventDefault();
                setHighlight((h) => (h <= 0 ? 0 : h - 1));
              } else if (e.key === 'Enter' && suggestOpen && suggestions.length) {
                e.preventDefault();
                pickVendor(suggestions[highlight >= 0 ? highlight : 0]);
              } else if (e.key === 'Escape') {
                setSuggestOpen(false);
              }
            }}
            required
          />
          {suggestOpen && suggestions.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-xl border border-primary-200 bg-surface shadow-card">
              {suggestions.map((v, idx) => (
                <li key={v._id}>
                  <button
                    type="button"
                    className={`w-full text-left px-4 py-2.5 text-sm ${
                      idx === highlight
                        ? 'bg-primary-100 text-primary-900 font-medium'
                        : 'text-primary-700 hover:bg-primary-50'
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => pickVendor(v)}
                  >
                    {v.name}
                    {v.city ? <span className="text-primary-400 ml-2 text-xs">{v.city}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selected && (
            <p className="text-xs text-primary-500 mt-1">Selected: {selected.name}</p>
          )}
        </div>

        <div>
          <label className="label">Notes</label>
          <input
            className="input-field"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
          />
        </div>

        <button type="submit" className="btn-primary w-full" disabled={saving}>
          <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Load'}
        </button>
      </form>

      <div className="card !p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-primary-100 font-semibold text-primary-700">
          Recent loads
        </div>
        {recent.length === 0 ? (
          <p className="text-center py-8 text-primary-400 text-sm">No loads yet</p>
        ) : (
          <ul className="divide-y divide-primary-50">
            {recent.map((load) => (
              <li key={load._id} className="px-4 py-3 text-sm flex justify-between gap-3">
                <span className="font-medium text-primary-800">{load.vendor?.name || '—'}</span>
                <span className="text-primary-500">
                  {formatDate(load.loadDate || load.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
