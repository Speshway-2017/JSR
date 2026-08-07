import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Plus, Download, Package, X, Save, ArrowLeft, Pencil, Trash2, Eye, History, FilePlus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatDate } from '../utils/format';
import { buildMaterialColumns, exportBrandedBagBagExcel, BRAND } from '../utils/salesOrderExcel';

function toUiEntries(entries = []) {
  return entries.map((e, i) => ({
    id: e.id || `row-${i}-${e.customerName}-${e.materialName}`,
    customerName: e.customerName,
    materialName: e.materialName,
    bags: e.bags,
  }));
}

function rememberValue(list, value) {
  const trimmed = value.trim();
  if (!trimmed) return list;
  const exists = list.some((item) => item.toLowerCase() === trimmed.toLowerCase());
  if (exists) return list;
  return [...list, trimmed].sort((a, b) => a.localeCompare(b));
}

function filterSuggestions(list, query) {
  const q = query.trim().toLowerCase();
  if (!q) return list.slice(0, 8);
  return list
    .filter((item) => item.toLowerCase().includes(q) && item.toLowerCase() !== q)
    .slice(0, 8);
}

/** List of saved reports */
export function SalesBagReportsList() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback(() => {
    setLoading(true);
    api
      .get('/sales-bag-reports')
      .then((res) => setReports(res.data))
      .catch(() => toast.error('Failed to load reports'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Delete report "${title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/sales-bag-reports/${id}`);
      toast.success('Report deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Previous Reports</h1>
          <p className="text-primary-400 text-sm mt-0.5">View, edit, or delete saved bag order sheets</p>
        </div>
        <Link to="/sales-orders" className="btn-primary !py-2 !px-4 !text-sm">
          <FilePlus className="w-4 h-4" /> New report
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-16 text-primary-400">Loading reports…</div>
      ) : reports.length === 0 ? (
        <div className="card text-center py-12 text-primary-400">
          <History className="w-10 h-10 mx-auto mb-2 text-primary-300" />
          No saved reports yet. Create one from Sales Orders and click Save.
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-primary-100 bg-primary-50/80">
                  <th className="px-4 py-3 font-semibold text-primary-500">Title</th>
                  <th className="px-4 py-3 font-semibold text-primary-500">Lines</th>
                  <th className="px-4 py-3 font-semibold text-primary-500">Updated</th>
                  <th className="px-4 py-3 font-semibold text-primary-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r._id} className="border-b border-primary-50 hover:bg-primary-50/40">
                    <td className="px-4 py-3 font-medium text-primary-800">{r.title || 'Untitled'}</td>
                    <td className="px-4 py-3 text-primary-600">{r.entries?.length || 0}</td>
                    <td className="px-4 py-3 text-primary-500">{formatDate(r.updatedAt || r.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          className="btn-secondary !py-1.5 !px-2.5 !text-xs"
                          onClick={() => navigate(`/sales-orders/${r._id}?mode=view`)}
                          title="View"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </button>
                        <button
                          type="button"
                          className="btn-secondary !py-1.5 !px-2.5 !text-xs"
                          onClick={() => navigate(`/sales-orders/${r._id}`)}
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          type="button"
                          className="btn-secondary !py-1.5 !px-2.5 !text-xs !text-red-600 hover:!bg-red-50"
                          onClick={() => handleDelete(r._id, r.title)}
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** Create / edit / view a bag order report */
export default function SalesOrders() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const viewOnly = searchParams.get('mode') === 'view';

  const [reportId, setReportId] = useState(id || null);
  const [title, setTitle] = useState('');
  const [entries, setEntries] = useState([]);
  const [knownNames, setKnownNames] = useState([]);
  const [knownMaterials, setKnownMaterials] = useState([]);
  const [personName, setPersonName] = useState('');
  const [materialName, setMaterialName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!id);

  const preview = useMemo(() => buildMaterialColumns(entries), [entries]);

  const nameSuggestions = useMemo(
    () => filterSuggestions(knownNames, personName),
    [knownNames, personName]
  );
  const materialSuggestions = useMemo(
    () => filterSuggestions(knownMaterials, materialName),
    [knownMaterials, materialName]
  );

  useEffect(() => {
    api.get('/sales-bag-reports/suggestions').then((res) => {
      setKnownNames(res.data.names || []);
      setKnownMaterials(res.data.materials || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) {
      setReportId(null);
      setTitle('');
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get(`/sales-bag-reports/${id}`)
      .then((res) => {
        setReportId(res.data._id);
        setTitle(res.data.title || '');
        setEntries(toUiEntries(res.data.entries));
        const names = [];
        const mats = [];
        for (const e of res.data.entries || []) {
          if (e.customerName) names.push(e.customerName);
          if (e.materialName) mats.push(e.materialName);
        }
        setKnownNames((prev) => names.reduce((acc, n) => rememberValue(acc, n), prev));
        setKnownMaterials((prev) => mats.reduce((acc, m) => rememberValue(acc, m), prev));
      })
      .catch(() => {
        toast.error('Report not found');
        navigate('/sales-orders/previous');
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const addEntry = (e) => {
    e.preventDefault();
    if (viewOnly) return;
    const name = personName.trim();
    const material = materialName.trim();
    const qty = parseInt(quantity, 10);

    if (!name) {
      toast.error('Enter a name');
      return;
    }
    if (!material) {
      toast.error('Enter a material name');
      return;
    }
    if (!qty || qty <= 0) {
      toast.error('Enter quantity (bags)');
      return;
    }

    setEntries((prev) => {
      const idx = prev.findIndex(
        (row) =>
          row.customerName.toLowerCase() === name.toLowerCase() &&
          row.materialName.toLowerCase() === material.toLowerCase()
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], bags: next[idx].bags + qty };
        return next;
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          customerName: name,
          materialName: material,
          bags: qty,
        },
      ];
    });

    setKnownNames((prev) => rememberValue(prev, name));
    setKnownMaterials((prev) => rememberValue(prev, material));
    setPersonName('');
    setMaterialName('');
    setQuantity('');
    toast.success('Added');
  };

  const removeEntry = (entryId) => {
    if (viewOnly || !entryId) return;
    setEntries((prev) => prev.filter((row) => row.id !== entryId));
  };

  const clearAll = () => {
    if (viewOnly) return;
    setEntries([]);
    setPersonName('');
    setMaterialName('');
    setQuantity('');
  };

  const handleSave = async () => {
    if (entries.length === 0) {
      toast.error('Add at least one line before saving');
      return;
    }
    setSaving(true);
    const payload = {
      title: title.trim(),
      entries: entries.map(({ customerName, materialName, bags }) => ({
        customerName,
        materialName,
        bags,
      })),
    };
    try {
      if (reportId) {
        const res = await api.put(`/sales-bag-reports/${reportId}`, payload);
        setTitle(res.data.title || title);
        toast.success('Report updated');
      } else {
        const res = await api.post('/sales-bag-reports', payload);
        setReportId(res.data._id);
        setTitle(res.data.title || '');
        toast.success('Report saved');
        navigate(`/sales-orders/${res.data._id}`, { replace: true });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (entries.length === 0) {
      toast.error('Add at least one line first');
      return;
    }
    setExporting(true);
    try {
      await exportBrandedBagBagExcel(entries);
      toast.success('Excel exported');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export Excel');
    } finally {
      setExporting(false);
    }
  };

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  if (loading) {
    return <div className="text-center py-20 text-primary-400">Loading report…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            {id && (
              <button
                type="button"
                onClick={() => navigate('/sales-orders/previous')}
                className="p-1.5 rounded-lg text-primary-500 hover:bg-primary-50"
                title="Back to reports"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h1 className="page-title">
              {viewOnly ? 'View Report' : reportId ? 'Edit Report' : 'Sales Orders'}
            </h1>
          </div>
          {!viewOnly ? (
            <input
              className="input-field max-w-md !py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Report title (optional)"
            />
          ) : (
            <p className="text-primary-600 font-medium">{title || 'Untitled report'}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/sales-orders/previous" className="btn-secondary !py-2 !px-4 !text-sm">
            <History className="w-4 h-4" /> Previous reports
          </Link>
          {entries.length > 0 && !viewOnly && (
            <button type="button" onClick={clearAll} className="btn-secondary !py-2 !px-4 !text-sm">
              Clear
            </button>
          )}
          {viewOnly && reportId && (
            <button
              type="button"
              onClick={() => navigate(`/sales-orders/${reportId}`)}
              className="btn-secondary !py-2 !px-4 !text-sm"
            >
              <Pencil className="w-4 h-4" /> Edit
            </button>
          )}
          {!viewOnly && (
            <button
              type="button"
              onClick={handleSave}
              disabled={entries.length === 0 || saving}
              className="btn-secondary !py-2 !px-4 !text-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : reportId ? 'Update' : 'Save'}
            </button>
          )}
          <button
            type="button"
            onClick={handleExport}
            disabled={entries.length === 0 || exporting}
            className="btn-primary !py-2 !px-4 !text-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>
      </div>

      {!viewOnly && (
        <form onSubmit={addEntry} className="card space-y-4" autoComplete="off">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SuggestInput
              label="Name *"
              value={personName}
              onChange={setPersonName}
              placeholder="e.g. Ramesh"
              suggestions={nameSuggestions}
            />
            <SuggestInput
              label="Material *"
              value={materialName}
              onChange={setMaterialName}
              placeholder="e.g. Mirchi"
              suggestions={materialSuggestions}
            />
            <div>
              <label className="label">Quantity (bags) *</label>
              <input
                type="number"
                min="1"
                step="1"
                className="input-field"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 10"
              />
            </div>
          </div>
          <button type="submit" className="btn-primary !py-2.5 !px-4">
            <Plus className="w-4 h-4" /> Add to list
          </button>
        </form>
      )}

      {entries.length === 0 ? (
        <div className="card text-center py-12 text-primary-400">
          <Package className="w-10 h-10 mx-auto mb-2 text-primary-300" />
          No lines yet. Type a name, material, and quantity to start.
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden border border-primary-200">
          <div
            className="px-4 py-3 text-center text-white font-bold text-xl tracking-wide"
            style={{ backgroundColor: `#${BRAND.primaryDark}` }}
          >
            {BRAND.companyName}
          </div>
          <div
            className="px-4 py-2 text-center text-sm italic"
            style={{ backgroundColor: `#${BRAND.subHeaderBg}`, color: `#${BRAND.primaryDark}` }}
          >
            {BRAND.tagline} · {dateStr}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm min-w-max">
              <thead>
                <tr>
                  {preview.materials.map((mat) => (
                    <th
                      key={mat}
                      colSpan={2}
                      className="px-3 py-2.5 text-center font-semibold text-white border"
                      style={{
                        backgroundColor: `#${BRAND.primary}`,
                        borderColor: `#${BRAND.border}`,
                      }}
                    >
                      {mat}
                    </th>
                  ))}
                </tr>
                <tr>
                  {preview.materials.map((mat) => (
                    <FragmentSubHeaders key={mat} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: preview.maxRows }).map((_, rowIdx) => (
                  <tr
                    key={rowIdx}
                    style={
                      rowIdx % 2 === 1
                        ? { backgroundColor: `#${BRAND.altRow}` }
                        : undefined
                    }
                  >
                    {preview.materials.map((mat) => {
                      const entry = preview.materialMap.get(mat)[rowIdx];
                      return (
                        <FragmentDataCells
                          key={`${mat}-${rowIdx}`}
                          entry={entry}
                          onRemove={removeEntry}
                          viewOnly={viewOnly}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2 text-center text-xs text-primary-400 border-t border-primary-100">
            Generated by {BRAND.companyName} · Confidential
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestInput({ label, value, onChange, placeholder, suggestions }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <label className="label">{label}</label>
      <input
        className="input-field"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-xl border border-primary-200 bg-surface shadow-card">
          {suggestions.map((item) => (
            <li key={item}>
              <button
                type="button"
                className="w-full text-left px-4 py-2.5 text-sm text-primary-700 hover:bg-primary-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(item);
                  setOpen(false);
                }}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FragmentSubHeaders() {
  return (
    <>
      <th
        className="px-3 py-1.5 text-center font-semibold border text-xs"
        style={{
          backgroundColor: `#${BRAND.subHeaderBg}`,
          color: `#${BRAND.subHeaderText}`,
          borderColor: `#${BRAND.border}`,
        }}
      >
        Name
      </th>
      <th
        className="px-3 py-1.5 text-center font-semibold border text-xs"
        style={{
          backgroundColor: `#${BRAND.subHeaderBg}`,
          color: `#${BRAND.subHeaderText}`,
          borderColor: `#${BRAND.border}`,
        }}
      >
        Qty
      </th>
    </>
  );
}

function FragmentDataCells({ entry, onRemove, viewOnly }) {
  return (
    <>
      <td
        className="px-3 py-2 border align-middle"
        style={{ borderColor: `#${BRAND.border}`, color: `#${BRAND.primaryDark}` }}
      >
        {entry ? (
          <div className="flex items-center justify-between gap-2 min-w-[7rem]">
            <span>{entry.customerName}</span>
            {!viewOnly && entry.id && (
              <button
                type="button"
                onClick={() => onRemove(entry.id)}
                className="p-0.5 text-primary-300 hover:text-red-500 shrink-0"
                title="Remove"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : null}
      </td>
      <td
        className="px-3 py-2 border text-center align-middle font-medium"
        style={{ borderColor: `#${BRAND.border}`, color: `#${BRAND.primaryDark}` }}
      >
        {entry ? entry.bags : ''}
      </td>
    </>
  );
}
