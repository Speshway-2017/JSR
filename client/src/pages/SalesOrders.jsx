import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Plus, Download, Package, X, ArrowLeft, Pencil, Trash2, Eye, History, FilePlus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatDate } from '../utils/format';
import { buildMaterialColumns, BRAND } from '../utils/salesOrderExcel';
import { exportBrandedBagBagPdf } from '../utils/salesOrderPdf';

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
          No saved reports yet. Add lines on Sales Orders — they save automatically.
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
  const [filterName, setFilterName] = useState('');
  const [filterMaterial, setFilterMaterial] = useState('');
  const [exporting, setExporting] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [loading, setLoading] = useState(!!id);

  const reportIdRef = useRef(reportId);
  const titleRef = useRef(title);
  const entriesRef = useRef(entries);
  const skipFetchRef = useRef(false);
  const titleSaveTimer = useRef(null);
  const cellSaveTimer = useRef(null);
  const materialInputRef = useRef(null);

  useEffect(() => {
    reportIdRef.current = reportId;
  }, [reportId]);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const filterOptions = useMemo(() => {
    const names = new Set();
    const materials = new Set();
    for (const e of entries) {
      if (e.customerName?.trim()) names.add(e.customerName.trim());
      if (e.materialName?.trim()) materials.add(e.materialName.trim());
    }
    return {
      names: Array.from(names).sort((a, b) => a.localeCompare(b)),
      materials: Array.from(materials).sort((a, b) => a.localeCompare(b)),
    };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (filterName && e.customerName.trim().toLowerCase() !== filterName.toLowerCase()) {
        return false;
      }
      if (
        filterMaterial &&
        e.materialName.trim().toLowerCase() !== filterMaterial.toLowerCase()
      ) {
        return false;
      }
      return true;
    });
  }, [entries, filterName, filterMaterial]);

  const filteredPreview = useMemo(
    () => buildMaterialColumns(filteredEntries),
    [filteredEntries]
  );

  const nameSuggestions = useMemo(
    () => filterSuggestions(knownNames, personName),
    [knownNames, personName]
  );
  const materialSuggestions = useMemo(
    () => filterSuggestions(knownMaterials, materialName),
    [knownMaterials, materialName]
  );

  useEffect(() => {
    Promise.all([
      api.get('/sales-materials').catch(() => ({ data: [] })),
      api.get('/sales-bag-reports/suggestions').catch(() => ({ data: { names: [], materials: [] } })),
    ]).then(([matsRes, sugRes]) => {
      const catalogNames = (matsRes.data || []).map((m) => m.name).filter(Boolean);
      const historyNames = sugRes.data?.names || [];
      const historyMats = sugRes.data?.materials || [];
      setKnownNames(historyNames.reduce((acc, n) => rememberValue(acc, n), []));
      setKnownMaterials(
        [...catalogNames, ...historyMats].reduce((acc, m) => rememberValue(acc, m), [])
      );
    });
  }, []);

  useEffect(() => {
    if (!id) {
      setReportId(null);
      setTitle('');
      setEntries([]);
      setPersonName('');
      setMaterialName('');
      setQuantity('');
      setFilterName('');
      setFilterMaterial('');
      setSaveStatus('idle');
      setLoading(false);
      return;
    }
    if (skipFetchRef.current && id === reportIdRef.current) {
      skipFetchRef.current = false;
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
        setSaveStatus('saved');
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

  const persistEntries = useCallback(async (nextEntries, nextTitle) => {
    if (viewOnly) return;

    const payload = {
      title: (nextTitle ?? titleRef.current).trim(),
      entries: nextEntries.map(({ customerName, materialName, bags }) => ({
        customerName,
        materialName,
        bags,
      })),
    };

    setSaveStatus('saving');
    try {
      const currentId = reportIdRef.current;

      if (nextEntries.length === 0) {
        if (currentId) {
          await api.delete(`/sales-bag-reports/${currentId}`);
          reportIdRef.current = null;
          setReportId(null);
          setSaveStatus('idle');
          skipFetchRef.current = true;
          navigate('/sales-orders', { replace: true });
        } else {
          setSaveStatus('idle');
        }
        return;
      }

      if (currentId) {
        const res = await api.put(`/sales-bag-reports/${currentId}`, payload);
        if (res.data.title) {
          setTitle(res.data.title);
          titleRef.current = res.data.title;
        }
        setSaveStatus('saved');
      } else {
        const res = await api.post('/sales-bag-reports', payload);
        reportIdRef.current = res.data._id;
        setReportId(res.data._id);
        if (res.data.title) {
          setTitle(res.data.title);
          titleRef.current = res.data.title;
        }
        setSaveStatus('saved');
        skipFetchRef.current = true;
        navigate(`/sales-orders/${res.data._id}`, { replace: true });
      }
    } catch (err) {
      setSaveStatus('error');
      toast.error(err.response?.data?.message || 'Auto-save failed');
    }
  }, [navigate, viewOnly]);

  const nextPerson = () => {
    setPersonName('');
    setMaterialName('');
    setQuantity('');
  };

  const addEntry = async (e) => {
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

    const idx = entries.findIndex(
      (row) =>
        row.customerName.toLowerCase() === name.toLowerCase() &&
        row.materialName.toLowerCase() === material.toLowerCase()
    );
    let nextEntries;
    if (idx >= 0) {
      nextEntries = [...entries];
      nextEntries[idx] = { ...nextEntries[idx], bags: nextEntries[idx].bags + qty };
    } else {
      nextEntries = [
        ...entries,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          customerName: name,
          materialName: material,
          bags: qty,
        },
      ];
    }

    setEntries(nextEntries);
    setKnownNames((prev) => rememberValue(prev, name));
    setKnownMaterials((prev) => rememberValue(prev, material));
    setMaterialName('');
    setQuantity('');
    setTimeout(() => materialInputRef.current?.focus(), 50);

    // Keep sales materials catalog in sync when a new name is typed
    api.post('/sales-materials', { name: material }).catch(() => {});

    await persistEntries(nextEntries);
  };

  const removeEntry = async (entryId) => {
    if (viewOnly || !entryId) return;
    const nextEntries = entries.filter((row) => row.id !== entryId);
    setEntries(nextEntries);
    await persistEntries(nextEntries);
  };

  const updateEntryField = (entryId, patch) => {
    if (viewOnly || !entryId) return;
    const nextEntries = entriesRef.current.map((row) =>
      row.id === entryId ? { ...row, ...patch } : row
    );
    setEntries(nextEntries);
    entriesRef.current = nextEntries;

    if (cellSaveTimer.current) clearTimeout(cellSaveTimer.current);
    cellSaveTimer.current = setTimeout(() => {
      const cleaned = entriesRef.current
        .map((row) => ({
          ...row,
          customerName: String(row.customerName || '').trim(),
          bags: Number(row.bags) || 0,
        }))
        .filter((row) => row.customerName && row.materialName && row.bags > 0);
      if (cleaned.length !== entriesRef.current.length) {
        setEntries(cleaned);
        entriesRef.current = cleaned;
      }
      persistEntries(cleaned);
    }, 500);
  };

  const clearAll = async () => {
    if (viewOnly) return;
    if (entries.length === 0) return;
    if (!window.confirm('Clear all lines? The saved report will be removed.')) return;
    setEntries([]);
    setPersonName('');
    setMaterialName('');
    setQuantity('');
    setFilterName('');
    setFilterMaterial('');
    await persistEntries([]);
  };

  const handleTitleChange = (value) => {
    setTitle(value);
    titleRef.current = value;
    if (viewOnly || !reportIdRef.current || entries.length === 0) return;
    if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
    titleSaveTimer.current = setTimeout(() => {
      persistEntries(entriesRef.current, value);
    }, 600);
  };

  useEffect(() => () => {
    if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
    if (cellSaveTimer.current) clearTimeout(cellSaveTimer.current);
  }, []);

  const handleExport = async () => {
    if (filteredEntries.length === 0) {
      toast.error(
        entries.length === 0
          ? 'Add at least one line first'
          : 'No rows match the current filters'
      );
      return;
    }
    setExporting(true);
    try {
      const filterNote = [
        filterName ? `Name: ${filterName}` : null,
        filterMaterial ? `Material: ${filterMaterial}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      exportBrandedBagBagPdf(filteredEntries, {
        title: title.trim() || undefined,
        filterNote: filterNote || undefined,
      });
      toast.success(
        filterName || filterMaterial
          ? `PDF exported (${filteredEntries.length} lines)`
          : 'PDF exported'
      );
    } catch (err) {
      console.error(err);
      toast.error('Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const saveLabel =
    saveStatus === 'saving'
      ? 'Saving…'
      : saveStatus === 'saved'
        ? 'Saved'
        : saveStatus === 'error'
          ? 'Save failed'
          : null;

  if (loading) {
    return <div className="text-center py-20 text-primary-400">Loading report…</div>;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3 overflow-hidden">
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
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
            {!viewOnly && saveLabel && (
              <span
                className={`text-xs font-medium ${
                  saveStatus === 'error'
                    ? 'text-red-500'
                    : saveStatus === 'saving'
                      ? 'text-primary-400'
                      : 'text-primary-500'
                }`}
              >
                {saveLabel}
              </span>
            )}
          </div>
          {!viewOnly ? (
            <input
              className="input-field max-w-md !py-2 text-sm"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
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
          <button
            type="button"
            onClick={handleExport}
            disabled={filteredEntries.length === 0 || exporting}
            className="btn-primary !py-2 !px-4 !text-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>

      {!viewOnly && (
        <form onSubmit={addEntry} className="card space-y-3 shrink-0 !p-4" autoComplete="off">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="label !mb-0">Name *</label>
                {personName.trim() !== '' && (
                  <button
                    type="button"
                    onClick={nextPerson}
                    className="text-xs font-semibold text-primary-600 hover:text-primary-800"
                  >
                    Next person
                  </button>
                )}
              </div>
              <SuggestInput
                hideLabel
                value={personName}
                onChange={setPersonName}
                placeholder="e.g. Ramesh"
                suggestions={nameSuggestions}
              />
            </div>
            <SuggestInput
              label="Material *"
              value={materialName}
              onChange={setMaterialName}
              placeholder="e.g. Mirchi"
              suggestions={materialSuggestions}
              inputRef={materialInputRef}
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
        <div className="card text-center py-12 text-primary-400 shrink-0">
          <Package className="w-10 h-10 mx-auto mb-2 text-primary-300" />
          No lines yet. Type a name, material, and quantity to start.
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden border border-primary-200 flex-1 min-h-0 flex flex-col">
          <div
            className="px-4 py-3 text-center text-white font-bold text-xl tracking-wide shrink-0"
            style={{ backgroundColor: `#${BRAND.primaryDark}` }}
          >
            {BRAND.companyName}
          </div>
          <div
            className="px-4 py-2 text-center text-sm italic shrink-0"
            style={{ backgroundColor: `#${BRAND.subHeaderBg}`, color: `#${BRAND.primaryDark}` }}
          >
            {BRAND.tagline} · {dateStr}
          </div>

          <div className="shrink-0 px-4 py-2.5 border-b border-primary-100 flex flex-col sm:flex-row gap-2 sm:items-center bg-surface">
            <span className="text-xs font-semibold text-primary-500 uppercase tracking-wide shrink-0">
              Filter / Export
            </span>
            <select
              className="input-field !py-1.5 !text-sm flex-1 min-w-0"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
            >
              <option value="">All names</option>
              {filterOptions.names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <select
              className="input-field !py-1.5 !text-sm flex-1 min-w-0"
              value={filterMaterial}
              onChange={(e) => setFilterMaterial(e.target.value)}
            >
              <option value="">All materials</option>
              {filterOptions.materials.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {(filterName || filterMaterial) && (
              <button
                type="button"
                className="text-xs font-semibold text-primary-600 hover:text-primary-800 shrink-0"
                onClick={() => {
                  setFilterName('');
                  setFilterMaterial('');
                }}
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            {filteredEntries.length === 0 ? (
              <div className="text-center py-10 text-primary-400 text-sm">
                No rows match the selected filters.
              </div>
            ) : (
              <table className="w-full border-collapse text-sm min-w-max">
                <thead className="sticky top-0 z-10">
                  <tr>
                    {filteredPreview.materials.map((mat) => (
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
                    {filteredPreview.materials.map((mat) => (
                      <FragmentSubHeaders key={mat} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: filteredPreview.maxRows }).map((_, rowIdx) => (
                    <tr
                      key={rowIdx}
                      style={
                        rowIdx % 2 === 1
                          ? { backgroundColor: `#${BRAND.altRow}` }
                          : { backgroundColor: '#ffffff' }
                      }
                    >
                      {filteredPreview.materials.map((mat) => {
                        const entry = filteredPreview.materialMap.get(mat)[rowIdx];
                        return (
                          <FragmentDataCells
                            key={`${mat}-${rowIdx}`}
                            entry={entry}
                            onRemove={removeEntry}
                            onUpdate={updateEntryField}
                            viewOnly={viewOnly}
                          />
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="px-4 py-2 text-center text-xs text-primary-400 border-t border-primary-100 shrink-0">
            Generated by {BRAND.companyName} · Confidential
            {(filterName || filterMaterial) && (
              <span>
                {' '}
                · Showing {filteredEntries.length} of {entries.length}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestInput({
  label = 'Field',
  value,
  onChange,
  placeholder,
  suggestions,
  inputRef,
  disabled,
  hideLabel,
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      {!hideLabel && label ? <label className="label">{label}</label> : null}
      <input
        ref={inputRef}
        className="input-field disabled:bg-primary-50/60"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {!disabled && open && suggestions.length > 0 && (
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

function FragmentDataCells({ entry, onRemove, onUpdate, viewOnly }) {
  if (!entry) {
    return (
      <>
        <td className="px-3 py-2 border" style={{ borderColor: `#${BRAND.border}` }} />
        <td className="px-3 py-2 border" style={{ borderColor: `#${BRAND.border}` }} />
      </>
    );
  }

  if (viewOnly) {
    return (
      <>
        <td
          className="px-3 py-2 border align-middle"
          style={{ borderColor: `#${BRAND.border}`, color: `#${BRAND.primaryDark}` }}
        >
          {entry.customerName}
        </td>
        <td
          className="px-3 py-2 border text-center align-middle font-medium"
          style={{ borderColor: `#${BRAND.border}`, color: `#${BRAND.primaryDark}` }}
        >
          {entry.bags}
        </td>
      </>
    );
  }

  return (
    <>
      <td
        className="px-1.5 py-1 border align-middle"
        style={{ borderColor: `#${BRAND.border}` }}
      >
        <div className="flex items-center gap-1 min-w-[7rem]">
          <input
            className="w-full min-w-0 bg-transparent border-0 px-1.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary-300 rounded"
            style={{ color: `#${BRAND.primaryDark}` }}
            value={entry.customerName}
            onChange={(e) => onUpdate(entry.id, { customerName: e.target.value })}
          />
          {entry.id && (
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
      </td>
      <td
        className="px-1.5 py-1 border text-center align-middle"
        style={{ borderColor: `#${BRAND.border}` }}
      >
        <input
          type="number"
          min="1"
          step="1"
          className="w-16 mx-auto bg-transparent border-0 px-1 py-1 text-sm text-center font-medium focus:outline-none focus:ring-1 focus:ring-primary-300 rounded"
          style={{ color: `#${BRAND.primaryDark}` }}
          value={entry.bags}
          onChange={(e) =>
            onUpdate(entry.id, {
              bags: e.target.value === '' ? '' : Number(e.target.value),
            })
          }
        />
      </td>
    </>
  );
}
