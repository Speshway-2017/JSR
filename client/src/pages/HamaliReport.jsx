import { useEffect, useState, useMemo, useCallback } from 'react';
import { Printer, RefreshCw, Layers, Calculator, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatDateOnly } from '../utils/format';
import { useDataRestored } from '../utils/useDataRestored';
import { openBillPreviewTab, writeToPrintWindow } from '../utils/raituBillShared';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function HamaliReport({ path: windowPath }) {
  const [date, setDate] = useState(todayInputValue());
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (windowPath && windowPath.includes('?')) {
      const sp = new URLSearchParams(windowPath.split('?')[1]);
      const pDate = sp.get('date');
      if (pDate) setDate(pDate);
    }
  }, [windowPath]);

  const loadHamaliSales = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    try {
      const res = await api.get('/sales', { params: { date } });
      setSales(res.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load sales data');
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadHamaliSales();
  }, [loadHamaliSales]);

  useDataRestored(loadHamaliSales);

  useEffect(() => {
    const handleUpdate = () => {
      loadHamaliSales();
    };
    const handleDateChange = (e) => {
      if (e.detail?.date) setDate(e.detail.date);
    };
    window.addEventListener('jsr_data_updated', handleUpdate);
    window.addEventListener('jsr_sales_date_changed', handleDateChange);
    return () => {
      window.removeEventListener('jsr_data_updated', handleUpdate);
      window.removeEventListener('jsr_sales_date_changed', handleDateChange);
    };
  }, [loadHamaliSales]);

  // Compute formula variables
  const hamaliCalc = useMemo(() => {
    let byWeightBags = 0;
    let byBagBags = 0;
    let byWeightCoolyBags = 0;
    let byBagCoolyBags = 0;
    let totalSaleBags = 0;

    const rowDetails = [];

    (sales || []).forEach((sale) => {
      const isCooly = Number(sale.handlingCharges) > 0 || Number(sale.coolyRate) > 0;
      const custName = sale.customer?.name || '—';
      const vendName = sale.vendor?.name || '—';

      (sale.lines || []).forEach((line) => {
        const lineBags = Number(line.bagCount) || line.bags?.length || 1;
        const isByBag = line.saleType === 'by_bag';
        totalSaleBags += lineBags;

        let lineHamaliRate = 0;
        let lineHamaliTotal = 0;

        if (isByBag) {
          byBagBags += lineBags;
          lineHamaliRate += 5;
          lineHamaliTotal += lineBags * 5;
          if (isCooly) {
            byBagCoolyBags += lineBags;
            lineHamaliRate += 6;
            lineHamaliTotal += lineBags * 6;
          }
        } else {
          byWeightBags += lineBags;
          lineHamaliRate += 8;
          lineHamaliTotal += lineBags * 8;
          if (isCooly) {
            byWeightCoolyBags += lineBags;
            lineHamaliRate += 15;
            lineHamaliTotal += lineBags * 15;
          }
        }

        rowDetails.push({
          saleId: sale._id,
          customerName: custName,
          vendorName: vendName,
          materialName: line.materialName || 'Item',
          saleType: isByBag ? 'By Bag' : 'By Weight',
          isCooly,
          bags: lineBags,
          weight: Number(line.totalKg) || 0,
          hamaliTotal: lineHamaliTotal,
        });
      });
    });

    const amtByWeight = byWeightBags * 8;
    const amtByBag = byBagBags * 5;
    const amtByWeightCooly = byWeightCoolyBags * 15;
    const amtByBagCooly = byBagCoolyBags * 6;

    const totalHamali = amtByWeight + amtByBag + amtByWeightCooly + amtByBagCooly;

    return {
      byWeightBags,
      amtByWeight,
      byBagBags,
      amtByBag,
      byWeightCoolyBags,
      amtByWeightCooly,
      byBagCoolyBags,
      amtByBagCooly,
      totalSaleBags,
      totalHamali,
      rowDetails,
    };
  }, [sales]);

  const handlePrint = () => {
    const previewTab = openBillPreviewTab();
    const formattedDate = formatDateOnly(date);

    const html = `<!DOCTYPE html>
<html lang="te">
<head>
  <meta charset="utf-8" />
  <title>Hamali Report - ${formattedDate}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; background: #fff; color: #111; }
    .preview-toolbar { position: sticky; top: 0; display: flex; justify-content: flex-end; gap: 10px; padding: 10px 16px; background: #f4f4f5; border-bottom: 1px solid #e4e4e7; }
    .preview-toolbar button { font: inherit; padding: 8px 16px; cursor: pointer; border-radius: 6px; border: 1px solid #d4d4d8; background: #fff; }
    .preview-toolbar button.primary { background: #166534; border-color: #166534; color: #fff; font-weight: 600; }
    .container { max-width: 900px; margin: 20px auto; padding: 0 16px; }
    h1 { margin: 0 0 4px; font-size: 22px; color: #166534; text-align: center; }
    p { font-size: 13px; color: #666; margin: 0 0 16px; text-align: center; }
    .kpi-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 20px; }
    .kpi-card { border: 1px solid #e4e4e7; border-radius: 8px; padding: 12px; text-align: center; background: #fafafa; }
    .kpi-card.main { background: #f0fdf4; border-color: #86efac; }
    .kpi-card .label { font-size: 11px; color: #71717a; font-weight: 600; margin-bottom: 4px; text-transform: uppercase; }
    .kpi-card .val { font-size: 18px; font-weight: 800; color: #18181b; }
    .kpi-card.main .val { font-size: 22px; color: #166534; }
    .kpi-card .sub { font-size: 11px; font-weight: 600; color: #166534; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 14px; }
    th, td { border: 1px solid #e4e4e7; padding: 6px 10px; text-align: left; }
    th { background: #f4f4f5; font-weight: 600; }
    .total-row td { background: #f0fdf4; font-weight: 700; font-size: 13px; }
    @media print {
      .preview-toolbar { display: none !important; }
      .container { margin: 0; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="preview-toolbar">
    <button type="button" onclick="window.close()">Close</button>
    <button type="button" class="primary" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="container">
    <h1>JSR AGRI TRADES - Hamali Report (కూలీ నివేదిక)</h1>
    <p>Calculated Cooly / Hamali charges for sales on <strong>${formattedDate}</strong></p>

    <div class="kpi-row">
      <div class="kpi-card main">
        <div class="label">Total Hamali Price</div>
        <div class="val">${formatCurrency(hamaliCalc.totalHamali)}</div>
        <div class="sub">Total calculated</div>
      </div>
      <div class="kpi-card">
        <div class="label">Weight (General)</div>
        <div class="val">${hamaliCalc.byWeightBags} <span style="font-size: 11px; font-weight: 400;">bags</span></div>
        <div class="sub">8 × ${hamaliCalc.byWeightBags} = ${formatCurrency(hamaliCalc.amtByWeight)}</div>
      </div>
      <div class="kpi-card">
        <div class="label">By Bag (General)</div>
        <div class="val">${hamaliCalc.byBagBags} <span style="font-size: 11px; font-weight: 400;">bags</span></div>
        <div class="sub">5 × ${hamaliCalc.byBagBags} = ${formatCurrency(hamaliCalc.amtByBag)}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Weight + Cooly</div>
        <div class="val">${hamaliCalc.byWeightCoolyBags} <span style="font-size: 11px; font-weight: 400;">bags</span></div>
        <div class="sub">15 × ${hamaliCalc.byWeightCoolyBags} = ${formatCurrency(hamaliCalc.amtByWeightCooly)}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Bag + Cooly</div>
        <div class="val">${hamaliCalc.byBagCoolyBags} <span style="font-size: 11px; font-weight: 400;">bags</span></div>
        <div class="sub">6 × ${hamaliCalc.byBagCoolyBags} = ${formatCurrency(hamaliCalc.amtByBagCooly)}</div>
      </div>
    </div>

    <h3 style="font-size: 14px; margin: 16px 0 6px; color: #166534;">Formula Calculation Breakdown</h3>
    <table>
      <thead>
        <tr>
          <th>Formula Component Description</th>
          <th>Sale Type</th>
          <th>Cooly Applied</th>
          <th style="text-align: right;">No. of Bags</th>
          <th style="text-align: right;">Rate / Bag</th>
          <th style="text-align: right;">Calculated Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>8 × (number of bags sales happened by weight)</strong></td>
          <td>By Weight</td>
          <td>All</td>
          <td style="text-align: right; font-weight: 700;">${hamaliCalc.byWeightBags}</td>
          <td style="text-align: right;">₹8</td>
          <td style="text-align: right; font-weight: 700; color: #15803d;">${formatCurrency(hamaliCalc.amtByWeight)}</td>
        </tr>
        <tr>
          <td><strong>5 × (number of bags sales happened by bags)</strong></td>
          <td>By Bag</td>
          <td>All</td>
          <td style="text-align: right; font-weight: 700;">${hamaliCalc.byBagBags}</td>
          <td style="text-align: right;">₹5</td>
          <td style="text-align: right; font-weight: 700; color: #15803d;">${formatCurrency(hamaliCalc.amtByBag)}</td>
        </tr>
        <tr>
          <td><strong>15 × (number of bags sold to customer by weight with cooly)</strong></td>
          <td>By Weight</td>
          <td>Yes (Cooly Checked)</td>
          <td style="text-align: right; font-weight: 700;">${hamaliCalc.byWeightCoolyBags}</td>
          <td style="text-align: right;">₹15</td>
          <td style="text-align: right; font-weight: 700; color: #15803d;">${formatCurrency(hamaliCalc.amtByWeightCooly)}</td>
        </tr>
        <tr>
          <td><strong>6 × (number of bags sold to customer by bags with cooly)</strong></td>
          <td>By Bag</td>
          <td>Yes (Cooly Checked)</td>
          <td style="text-align: right; font-weight: 700;">${hamaliCalc.byBagCoolyBags}</td>
          <td style="text-align: right;">₹6</td>
          <td style="text-align: right; font-weight: 700; color: #15803d;">${formatCurrency(hamaliCalc.amtByBagCooly)}</td>
        </tr>
        <tr class="total-row">
          <td style="font-size: 13px;">TOTAL HAMALI / COOLY PRICE</td>
          <td colspan="2"></td>
          <td style="text-align: right; font-size: 13px;">${hamaliCalc.totalSaleBags} bags</td>
          <td style="text-align: right;">—</td>
          <td style="text-align: right; font-size: 14px; color: #166534;">${formatCurrency(hamaliCalc.totalHamali)}</td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>`;

    writeToPrintWindow(html, previewTab);
  };

  return (
    <div className="space-y-3 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="page-title text-2xl font-bold text-primary-700 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-emerald-600" />
            Hamali Report (కూలీ నివేదిక)
          </h1>
          <p className="text-xs text-primary-500 mt-1">
            Calculated Cooly / Hamali charges for sales on {formatDateOnly(date)}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            className="btn-secondary !py-1.5 !px-3 !text-sm font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs"
            onClick={loadHamaliSales}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            type="button"
            className="btn-primary !py-1.5 !px-3 !text-sm font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs"
            onClick={handlePrint}
          >
            <Printer className="w-4 h-4" /> Print / Save PDF
          </button>
        </div>
      </div>

      {/* Filter Card */}
      <div className="card !p-3">
        <div className="flex items-center gap-2 max-w-xs">
          <div className="w-full">
            <label className="text-xs font-semibold text-primary-600 mb-1 block">
              Date *
            </label>
            <input
              type="date"
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <div className="card !py-2.5 !px-3 flex flex-col justify-between border border-emerald-300 bg-emerald-50/50">
          <span className="text-xs font-bold uppercase tracking-wide text-emerald-800">
            Total Hamali
          </span>
          <span className="text-base font-bold text-emerald-900 tabular-nums my-1">
            {formatCurrency(hamaliCalc.totalHamali)}
          </span>
          <span className="text-xs text-emerald-700 font-semibold">Final calculated</span>
        </div>

        <div className="card !py-2.5 !px-3 flex flex-col justify-between border border-primary-200">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary-600">
            Weight (General)
          </span>
          <span className="text-sm font-bold text-primary-800 tabular-nums my-1">
            {hamaliCalc.byWeightBags} <span className="text-xs font-normal text-primary-500">bags</span>
          </span>
          <span className="text-xs font-semibold text-emerald-700 tabular-nums">
            8 × {hamaliCalc.byWeightBags} = {formatCurrency(hamaliCalc.amtByWeight)}
          </span>
        </div>

        <div className="card !py-2.5 !px-3 flex flex-col justify-between border border-primary-200">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary-600">
            By Bag (General)
          </span>
          <span className="text-sm font-bold text-primary-800 tabular-nums my-1">
            {hamaliCalc.byBagBags} <span className="text-xs font-normal text-primary-500">bags</span>
          </span>
          <span className="text-xs font-semibold text-emerald-700 tabular-nums">
            5 × {hamaliCalc.byBagBags} = {formatCurrency(hamaliCalc.amtByBag)}
          </span>
        </div>

        <div className="card !py-2.5 !px-3 flex flex-col justify-between border border-primary-200">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary-600">
            Weight + Cooly
          </span>
          <span className="text-sm font-bold text-primary-800 tabular-nums my-1">
            {hamaliCalc.byWeightCoolyBags} <span className="text-xs font-normal text-primary-500">bags</span>
          </span>
          <span className="text-xs font-semibold text-emerald-700 tabular-nums">
            15 × {hamaliCalc.byWeightCoolyBags} = {formatCurrency(hamaliCalc.amtByWeightCooly)}
          </span>
        </div>

        <div className="card !py-2.5 !px-3 flex flex-col justify-between border border-primary-200">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary-600">
            Bag + Cooly
          </span>
          <span className="text-sm font-bold text-primary-800 tabular-nums my-1">
            {hamaliCalc.byBagCoolyBags} <span className="text-xs font-normal text-primary-500">bags</span>
          </span>
          <span className="text-xs font-semibold text-emerald-700 tabular-nums">
            6 × {hamaliCalc.byBagCoolyBags} = {formatCurrency(hamaliCalc.amtByBagCooly)}
          </span>
        </div>
      </div>

      {/* Formula Calculation Breakdown Table */}
      <div className="card !p-0 overflow-hidden border border-primary-200">
        <div className="px-3.5 py-2 border-b border-primary-100 bg-primary-50/70 flex items-center justify-between">
          <h2 className="font-bold text-primary-800 text-sm flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-emerald-600" /> Formula Calculation Breakdown
          </h2>
          <span className="text-xs text-primary-500 font-medium">
            Date: {formatDateOnly(date)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-primary-50/80 text-left border-b border-primary-200">
                <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide">
                  Formula Component Description
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide w-28">
                  Sale Type
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide w-40">
                  Cooly Applied
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide text-right w-28">
                  No. of Bags
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide text-right w-24">
                  Rate / Bag
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide text-right w-32">
                  Calculated Total
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-primary-100 hover:bg-primary-50/40 transition">
                <td className="px-3 py-2 font-semibold text-primary-800 text-xs">
                  8 × (number of bags sales happened by weight)
                </td>
                <td className="px-3 py-2 text-primary-600 text-xs font-medium">By Weight</td>
                <td className="px-3 py-2 text-primary-500 text-xs font-medium">All</td>
                <td className="px-3 py-2 text-right font-bold text-primary-900 tabular-nums text-xs">
                  {hamaliCalc.byWeightBags}
                </td>
                <td className="px-3 py-2 text-right text-primary-600 text-xs font-medium">₹8</td>
                <td className="px-3 py-2 text-right font-bold text-emerald-700 tabular-nums text-xs">
                  {formatCurrency(hamaliCalc.amtByWeight)}
                </td>
              </tr>
              <tr className="border-b border-primary-100 hover:bg-primary-50/40 transition">
                <td className="px-3 py-2 font-semibold text-primary-800 text-xs">
                  5 × (number of bags sales happened by bags)
                </td>
                <td className="px-3 py-2 text-primary-600 text-xs font-medium">By Bag</td>
                <td className="px-3 py-2 text-primary-500 text-xs font-medium">All</td>
                <td className="px-3 py-2 text-right font-bold text-primary-900 tabular-nums text-xs">
                  {hamaliCalc.byBagBags}
                </td>
                <td className="px-3 py-2 text-right text-primary-600 text-xs font-medium">₹5</td>
                <td className="px-3 py-2 text-right font-bold text-emerald-700 tabular-nums text-xs">
                  {formatCurrency(hamaliCalc.amtByBag)}
                </td>
              </tr>
              <tr className="border-b border-primary-100 hover:bg-primary-50/40 transition">
                <td className="px-3 py-2 font-semibold text-primary-800 text-xs">
                  15 × (number of bags sold to customer by weight with cooly)
                </td>
                <td className="px-3 py-2 text-primary-600 text-xs font-medium">By Weight</td>
                <td className="px-3 py-2 font-semibold text-emerald-700 text-xs">Yes (Cooly Checked)</td>
                <td className="px-3 py-2 text-right font-bold text-primary-900 tabular-nums text-xs">
                  {hamaliCalc.byWeightCoolyBags}
                </td>
                <td className="px-3 py-2 text-right text-primary-600 text-xs font-medium">₹15</td>
                <td className="px-3 py-2 text-right font-bold text-emerald-700 tabular-nums text-xs">
                  {formatCurrency(hamaliCalc.amtByWeightCooly)}
                </td>
              </tr>
              <tr className="border-b border-primary-100 hover:bg-primary-50/40 transition">
                <td className="px-3 py-2 font-semibold text-primary-800 text-xs">
                  6 × (number of bags sold to customer by bags with cooly)
                </td>
                <td className="px-3 py-2 text-primary-600 text-xs font-medium">By Bag</td>
                <td className="px-3 py-2 font-semibold text-emerald-700 text-xs">Yes (Cooly Checked)</td>
                <td className="px-3 py-2 text-right font-bold text-primary-900 tabular-nums text-xs">
                  {hamaliCalc.byBagCoolyBags}
                </td>
                <td className="px-3 py-2 text-right text-primary-600 text-xs font-medium">₹6</td>
                <td className="px-3 py-2 text-right font-bold text-emerald-700 tabular-nums text-xs">
                  {formatCurrency(hamaliCalc.amtByBagCooly)}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-accent-50 border-t-2 border-primary-200 font-bold text-sm">
                <td colSpan={3} className="px-3 py-2.5 text-primary-800 font-bold uppercase tracking-wide">
                  TOTAL HAMALI / COOLY PRICE
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-primary-900 tabular-nums">
                  {hamaliCalc.totalSaleBags} bags
                </td>
                <td className="px-3 py-2.5 text-right text-primary-400">—</td>
                <td className="px-3 py-2.5 text-right font-bold text-accent-700 tabular-nums text-sm">
                  {formatCurrency(hamaliCalc.totalHamali)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Itemized Sales Table */}
      <div className="card !p-0 overflow-hidden border border-primary-200">
        <div className="px-3.5 py-2 border-b border-primary-100 bg-primary-50/70 flex items-center justify-between">
          <h3 className="font-bold text-primary-800 text-sm">
            Itemized Sales Entries ({hamaliCalc.rowDetails.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-primary-50/80 text-left border-b border-primary-200">
                <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide w-12">
                  #
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide">
                  Customer
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide">
                  Vendor
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide">
                  Product
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide text-center w-28">
                  Sale Type
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide text-center w-28">
                  Cooly
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide text-right w-24">
                  Bags
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide text-right w-32">
                  Hamali Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {hamaliCalc.rowDetails.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-primary-400 text-sm">
                    No sales records found for {formatDateOnly(date)}
                  </td>
                </tr>
              ) : (
                hamaliCalc.rowDetails.map((row, idx) => (
                  <tr key={`${row.saleId}-${idx}`} className="border-b border-primary-100 hover:bg-primary-50/40 transition">
                    <td className="px-3 py-2 text-primary-400 font-mono text-xs">{idx + 1}</td>
                    <td className="px-3 py-2 font-semibold text-primary-800 text-xs">{row.customerName}</td>
                    <td className="px-3 py-2 text-primary-600 text-xs font-medium">{row.vendorName}</td>
                    <td className="px-3 py-2 text-primary-700 text-xs font-medium">{row.materialName}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-primary-100/70 text-primary-700">
                        {row.saleType}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.isCooly ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-primary-400 text-xs font-medium">
                          <XCircle className="w-3.5 h-3.5 text-primary-300" /> No
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-primary-900 tabular-nums text-xs">
                      {row.bags}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-700 tabular-nums text-xs">
                      {formatCurrency(row.hamaliTotal)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
