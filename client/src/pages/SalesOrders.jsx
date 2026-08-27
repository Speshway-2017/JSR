import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Plus, Download, Package, X, ArrowLeft, Pencil, Trash2, Eye, History, FilePlus, FileText, FileSpreadsheet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatDate } from '../utils/format';
import { matchesPrefix } from '../utils/search';
import { buildMaterialColumns, BRAND, exportBrandedBagBagExcel, exportIndividualBagReportExcel, listPersonNames } from '../utils/salesOrderExcel';
import { exportBrandedBagBagPdf, exportIndividualBagReportPdf, PDF_PAPER_SIZES } from '../utils/salesOrderPdf';
import { useDataRestored } from '../utils/useDataRestored';

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
  const existing = list.find((item) => item.toLowerCase() === trimmed.toLowerCase());
  if (existing) return list;
  return [...list, trimmed].sort((a, b) => a.localeCompare(b));
}

/** Prefer existing catalog casing when names only differ by capitalization. */
function canonicalizeName(list, value) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const existing = list.find((item) => item.toLowerCase() === trimmed.toLowerCase());
  return existing || trimmed;
}

function filterSuggestions(list, query, { requireQuery = false } = {}) {
  const q = query.trim().toLowerCase();
  if (!q) return requireQuery ? [] : list.slice(0, 8);
  return list
    .filter((item) => matchesPrefix(item, q) && item.toLowerCase() !== q)
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

  useDataRestored(load);

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
  const [showExportChooser, setShowExportChooser] = useState(false);
  /** null | 'sheet' | 'individual' */
  const [exportMode, setExportMode] = useState(null);
  /** null | 'pdf-size' — second step after choosing PDF */
  const [exportStep, setExportStep] = useState(null);
  const [selectedExportNames, setSelectedExportNames] = useState([]);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [loading, setLoading] = useState(!!id);

  const reportIdRef = useRef(reportId);
  const titleRef = useRef(title);
  const entriesRef = useRef(entries);
  const skipFetchRef = useRef(false);
  const titleSaveTimer = useRef(null);
  const cellSaveTimer = useRef(null);
  const materialInputRef = useRef(null);
  const quantityInputRef = useRef(null);

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
    const names = new Map();
    const materials = new Map();
    for (const e of entries) {
      const name = e.customerName?.trim();
      const mat = e.materialName?.trim();
      if (name) {
        const key = name.toLowerCase();
        if (!names.has(key)) names.set(key, name);
      }
      if (mat) {
        const key = mat.toLowerCase();
        if (!materials.has(key)) materials.set(key, mat);
      }
    }
    return {
      names: Array.from(names.values()).sort((a, b) => a.localeCompare(b)),
      materials: Array.from(materials.values()).sort((a, b) => a.localeCompare(b)),
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
    () => filterSuggestions(knownMaterials, materialName, { requireQuery: true }),
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
    const material = canonicalizeName(knownMaterials, materialName);
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
      nextEntries[idx] = {
        ...nextEntries[idx],
        materialName: nextEntries[idx].materialName || material,
        bags: nextEntries[idx].bags + qty,
      };
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
    setMaterialName('');
    setQuantity('');
    setTimeout(() => materialInputRef.current?.focus(), 50);

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
      // Keep rows even when quantity is temporarily cleared while editing
      const cleaned = entriesRef.current
        .map((row) => ({
          ...row,
          customerName: String(row.customerName || '').trim(),
          bags: row.bags === '' || row.bags == null ? '' : Number(row.bags) || 0,
        }))
        .filter((row) => row.customerName && row.materialName);
      if (cleaned.length !== entriesRef.current.length) {
        setEntries(cleaned);
        entriesRef.current = cleaned;
      }
      persistEntries(
        cleaned.map((row) => ({
          ...row,
          bags: Number(row.bags) || 0,
        }))
      );
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

  const ensureExportable = () => {
    if (filteredEntries.length === 0) {
      toast.error(
        entries.length === 0
          ? 'Add at least one line first'
          : 'No rows match the current filters'
      );
      return false;
    }
    return true;
  };

  const openSheetExport = () => {
    if (!ensureExportable()) return;
    setExportMode('sheet');
    setExportStep(null);
    setShowExportChooser(true);
  };

  const openIndividualExport = () => {
    if (!ensureExportable()) return;
    setSelectedExportNames(listPersonNames(filteredEntries));
    setExportMode('individual');
    setExportStep(null);
    setShowExportChooser(true);
  };

  const closeExportChooser = () => {
    setShowExportChooser(false);
    setExportMode(null);
    setExportStep(null);
  };

  const toggleExportName = (name) => {
    setSelectedExportNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const exportPersonNames = useMemo(
    () => listPersonNames(filteredEntries),
    [filteredEntries]
  );

  const allExportNamesSelected =
    exportPersonNames.length > 0 &&
    exportPersonNames.every((n) => selectedExportNames.includes(n));

  const toggleSelectAllExportNames = () => {
    setSelectedExportNames(allExportNamesSelected ? [] : [...exportPersonNames]);
  };

  const handleExport = async (format, paperSize = 'a4') => {
    if (filteredEntries.length === 0) {
      toast.error(
        entries.length === 0
          ? 'Add at least one line first'
          : 'No rows match the current filters'
      );
      return;
    }
    setShowExportChooser(false);
    setExportMode(null);
    setExportStep(null);
    setExporting(true);
    try {
      const filterNote = [
        filterName ? `Name: ${filterName}` : null,
        filterMaterial ? `Material: ${filterMaterial}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      if (format === 'excel') {
        const ok = await exportBrandedBagBagExcel(filteredEntries);
        if (!ok) {
          toast.error('Nothing to export');
          return;
        }
        toast.success(
          filterName || filterMaterial
            ? `Excel exported (${filteredEntries.length} lines)`
            : 'Excel exported'
        );
      } else {
        const ok = exportBrandedBagBagPdf(filteredEntries, {
          title: title.trim() || undefined,
          filterNote: filterNote || undefined,
          paperSize,
        });
        if (!ok) {
          toast.error('Nothing to export');
          return;
        }
        const sizeLabel = PDF_PAPER_SIZES.find((s) => s.id === paperSize)?.label || paperSize;
        toast.success(
          filterName || filterMaterial
            ? `PDF (${sizeLabel}) exported · ${filteredEntries.length} lines`
            : `PDF exported · ${sizeLabel}`
        );
      }
    } catch (err) {
      console.error(err);
      toast.error(format === 'excel' ? 'Failed to export Excel' : 'Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  const handleIndividualExport = async (format, paperSize = 'a4') => {
    if (selectedExportNames.length === 0) {
      toast.error('Select at least one name');
      return;
    }
    setShowExportChooser(false);
    setExportMode(null);
    setExportStep(null);
    setExporting(true);
    try {
      const opts = { title: title.trim() || undefined, paperSize };
      if (format === 'excel') {
        const ok = await exportIndividualBagReportExcel(
          filteredEntries,
          selectedExportNames,
          opts
        );
        if (!ok) {
          toast.error('Nothing to export');
          return;
        }
        toast.success(`Individual Excel exported (${selectedExportNames.length} names)`);
      } else {
        const ok = exportIndividualBagReportPdf(
          filteredEntries,
          selectedExportNames,
          opts
        );
        if (!ok) {
          toast.error('Nothing to export');
          return;
        }
        const sizeLabel = PDF_PAPER_SIZES.find((s) => s.id === paperSize)?.label || paperSize;
        toast.success(
          `Individual PDF (${sizeLabel}) · ${selectedExportNames.length} names`
        );
      }
    } catch (err) {
      console.error(err);
      toast.error(format === 'excel' ? 'Failed to export Excel' : 'Failed to export PDF');
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
            onClick={openSheetExport}
            disabled={filteredEntries.length === 0 || exporting}
            className="btn-primary !py-2 !px-4 !text-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Exporting…' : 'Bag order'}
          </button>
          <button
            type="button"
            onClick={openIndividualExport}
            disabled={filteredEntries.length === 0 || exporting}
            className="btn-secondary !py-2 !px-4 !text-sm disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            Individual
          </button>
        </div>
      </div>

      {showExportChooser && exportMode === 'sheet' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="card w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-primary-800">
                {exportStep === 'pdf-size' ? 'PDF paper size' : 'Export bag order'}
              </h2>
              <button
                type="button"
                onClick={closeExportChooser}
                className="p-2 rounded-lg hover:bg-primary-50 text-primary-500"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {exportStep === 'pdf-size' ? (
              <>
                <p className="text-sm text-primary-500">
                  Choose paper size. A3 fits more materials per page; thermal prints a compact list for receipt printers.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {PDF_PAPER_SIZES.map((size) => (
                    <button
                      key={size.id}
                      type="button"
                      onClick={() => handleExport('pdf', size.id)}
                      className="w-full rounded-xl border border-primary-200 bg-surface px-4 py-3 text-left hover:bg-primary-50 transition"
                    >
                      <span className="block font-semibold text-primary-800">{size.label}</span>
                      <span className="block text-xs text-primary-400 mt-0.5">{size.description}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setExportStep(null)}
                  className="text-sm font-medium text-primary-500 hover:text-primary-700"
                >
                  ← Back
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-primary-500">
                  Export the bag order sheet (materials as columns).
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => setExportStep('pdf-size')}
                    className="btn-primary !py-3 justify-center"
                  >
                    <FileText className="w-4 h-4" /> PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('excel')}
                    className="btn-secondary !py-3 justify-center"
                  >
                    <FileSpreadsheet className="w-4 h-4" /> Excel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showExportChooser && exportMode === 'individual' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="card w-full max-w-md space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-primary-800">
                {exportStep === 'pdf-size' ? 'PDF paper size' : 'Export individual'}
              </h2>
              <button
                type="button"
                onClick={closeExportChooser}
                className="p-2 rounded-lg hover:bg-primary-50 text-primary-500"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {exportStep === 'pdf-size' ? (
              <>
                <p className="text-sm text-primary-500">
                  Choose paper size for the individual bag report.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {PDF_PAPER_SIZES.map((size) => (
                    <button
                      key={size.id}
                      type="button"
                      onClick={() => handleIndividualExport('pdf', size.id)}
                      disabled={selectedExportNames.length === 0}
                      className="w-full rounded-xl border border-primary-200 bg-surface px-4 py-3 text-left hover:bg-primary-50 transition disabled:opacity-50"
                    >
                      <span className="block font-semibold text-primary-800">{size.label}</span>
                      <span className="block text-xs text-primary-400 mt-0.5">{size.description}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setExportStep(null)}
                  className="text-sm font-medium text-primary-500 hover:text-primary-700 shrink-0"
                >
                  ← Back
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-primary-500">
                  Select names to include. Each person will list their materials and quantities.
                </p>
                <div className="flex items-center justify-between shrink-0">
                  <label className="flex items-center gap-2 text-sm font-semibold text-primary-800 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-primary-300 text-primary-600 focus:ring-primary-500"
                      checked={allExportNamesSelected}
                      onChange={toggleSelectAllExportNames}
                    />
                    Select all
                  </label>
                  <span className="text-xs text-primary-500">
                    {selectedExportNames.length} of {exportPersonNames.length} selected
                  </span>
                </div>
                <ul className="flex-1 min-h-0 overflow-y-auto max-h-56 rounded-xl border border-primary-200 divide-y divide-primary-100">
                  {exportPersonNames.map((name) => (
                    <li key={name}>
                      <label className="flex items-center gap-3 px-3 py-2.5 text-sm text-primary-800 hover:bg-primary-50/60 cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded border-primary-300 text-primary-600 focus:ring-primary-500"
                          checked={selectedExportNames.includes(name)}
                          onChange={() => toggleExportName(name)}
                        />
                        {name}
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="grid grid-cols-1 gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setExportStep('pdf-size')}
                    disabled={selectedExportNames.length === 0}
                    className="btn-primary !py-3 justify-center disabled:opacity-50"
                  >
                    <FileText className="w-4 h-4" /> PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => handleIndividualExport('excel')}
                    disabled={selectedExportNames.length === 0}
                    className="btn-secondary !py-3 justify-center disabled:opacity-50"
                  >
                    <FileSpreadsheet className="w-4 h-4" /> Excel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
              placeholder="Type to search materials…"
              suggestions={materialSuggestions}
              inputRef={materialInputRef}
              suggestOnType
              onPick={() => quantityInputRef.current?.focus()}
            />
            <div>
              <label className="label">Quantity (bags) *</label>
              <input
                ref={quantityInputRef}
                type="text"
                inputMode="numeric"
                className="input-field"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ''))}
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
                            onUpdate={updateEntryField}
                            viewOnly={viewOnly}
                          />
                        );
                      })}
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: `#${BRAND.subHeaderBg}` }}>
                    {filteredPreview.materials.map((mat) => (
                      <FragmentTotalCells
                        key={`total-${mat}`}
                        total={filteredPreview.totals[mat] || 0}
                      />
                    ))}
                  </tr>
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
  /** Only show suggestion list while the user is typing (no open-on-focus dropdown). */
  suggestOnType = false,
  /** Called after a suggestion is chosen (Enter, click, etc.). */
  onPick,
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const listRef = useRef(null);

  const showList =
    !disabled &&
    open &&
    suggestions.length > 0 &&
    (!suggestOnType || value.trim().length > 0);

  useEffect(() => {
    setHighlight(-1);
  }, [value, suggestions]);

  useEffect(() => {
    if (!showList || highlight < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, showList]);

  const pick = (item) => {
    onChange(item);
    setOpen(false);
    setHighlight(-1);
    onPick?.(item);
  };

  const onKeyDown = (e) => {
    if (disabled) return;

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

    if (e.key === 'Enter') {
      // Material field: Enter selects match (highlighted or first) and advances via onPick
      if (onPick && suggestions.length > 0 && (!suggestOnType || value.trim().length > 0)) {
        e.preventDefault();
        pick(highlight >= 0 ? suggestions[highlight] : suggestions[0]);
        return;
      }
      if (showList && highlight >= 0 && suggestions[highlight]) {
        e.preventDefault();
        pick(suggestions[highlight]);
        return;
      }
    }

    if (e.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
    }
  };

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
        onFocus={() => {
          if (!suggestOnType) setOpen(true);
        }}
        onBlur={() => setTimeout(() => {
          setOpen(false);
          setHighlight(-1);
        }, 150)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-activedescendant={
          showList && highlight >= 0 ? `suggest-opt-${highlight}` : undefined
        }
      />
      {showList && (
        <ul
          ref={listRef}
          className="absolute z-20 left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-xl border border-primary-200 bg-surface shadow-card"
          role="listbox"
        >
          {suggestions.map((item, idx) => (
            <li key={item} role="option" aria-selected={idx === highlight}>
              <button
                type="button"
                id={`suggest-opt-${idx}`}
                data-idx={idx}
                className={`w-full text-left px-4 py-2.5 text-sm ${
                  idx === highlight
                    ? 'bg-primary-100 text-primary-900 font-medium'
                    : 'text-primary-700 hover:bg-primary-50'
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => pick(item)}
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

function FragmentDataCells({ entry, onUpdate, viewOnly }) {
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
        <input
          className="w-full min-w-[7rem] bg-transparent border-0 px-1.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary-300 rounded"
          style={{ color: `#${BRAND.primaryDark}` }}
          value={entry.customerName}
          onChange={(e) => onUpdate(entry.id, { customerName: e.target.value })}
        />
      </td>
      <td
        className="px-1.5 py-1 border text-center align-middle"
        style={{ borderColor: `#${BRAND.border}` }}
      >
        <input
          type="text"
          inputMode="numeric"
          className="w-16 mx-auto bg-transparent border-0 px-1 py-1 text-sm text-center font-medium focus:outline-none focus:ring-1 focus:ring-primary-300 rounded"
          style={{ color: `#${BRAND.primaryDark}` }}
          value={entry.bags}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d]/g, '');
            onUpdate(entry.id, { bags: raw === '' ? '' : Number(raw) });
          }}
        />
      </td>
    </>
  );
}

function FragmentTotalCells({ total }) {
  return (
    <>
      <td
        className="px-3 py-2.5 border align-middle text-sm"
        style={{
          borderColor: `#${BRAND.border}`,
          color: `#${BRAND.primaryDark}`,
          backgroundColor: `#${BRAND.subHeaderBg}`,
          fontWeight: 800,
        }}
      >
        Total
      </td>
      <td
        className="px-3 py-2.5 border text-center align-middle text-sm"
        style={{
          borderColor: `#${BRAND.border}`,
          color: `#${BRAND.primaryDark}`,
          backgroundColor: `#${BRAND.subHeaderBg}`,
          fontWeight: 800,
        }}
      >
        {total}
      </td>
    </>
  );
}
