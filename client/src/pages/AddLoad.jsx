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
    <div className="space-y-3 max-w-2xl">
      <div>
        <h1 className="page-title text-2xl font-bold text-primary-700">Add Load</h1>
        <p className="text-xs text-primary-500 mt-1">
          Record that a vendor brought a load on a date (for Sale Patty). Not a purchase.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-3 !p-4">
        <div>
          <label className="text-xs font-semibold text-primary-600 mb-1 block">Date *</label>
          <input
            type="date"
            className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
            value={loadDate}
            onChange={(e) => setLoadDate(e.target.value)}
            required
          />
        </div>

        <div className="relative">
          <label className="text-xs font-semibold text-primary-600 mb-1 block">Vendor *</label>
          <input
            className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
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
                    className={`w-full text-left px-3.5 py-2 text-sm ${
                      idx === highlight
                        ? 'bg-primary-100 text-primary-900 font-semibold'
                        : 'text-primary-700 hover:bg-primary-50'
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => pickVendor(v)}
                  >
                    <span className="font-semibold">{v.name}</span>
                    {v.city ? <span className="text-primary-500 ml-2 text-xs">({v.city})</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selected && (
            <p className="text-xs text-primary-600 font-medium mt-1">Selected: <span className="font-bold text-primary-800">{selected.name}</span></p>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-primary-600 mb-1 block">Notes</label>
          <input
            className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes…"
          />
        </div>

        <button type="submit" className="btn-primary w-full !py-2 !text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-2xs" disabled={saving}>
          <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Load'}
        </button>
      </form>

      <div className="card !p-0 overflow-hidden border border-primary-200">
        <div className="px-4 py-2.5 border-b border-primary-200 bg-primary-50/80 font-bold text-xs text-primary-700 uppercase tracking-wide">
          Recent loads
        </div>
        {recent.length === 0 ? (
          <p className="text-center py-8 text-primary-400 text-xs">No loads yet</p>
        ) : (
          <ul className="divide-y divide-primary-100">
            {recent.map((load) => (
              <li key={load._id} className="px-4 py-2.5 text-xs flex justify-between items-center hover:bg-primary-50/30 transition">
                <span className="font-bold text-primary-800 text-sm">{load.vendor?.name || '—'}</span>
                <span className="text-primary-500 font-medium">
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
