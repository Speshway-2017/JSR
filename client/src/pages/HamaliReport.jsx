import { useEffect, useState, useMemo, useCallback } from 'react';
import { Calendar, Printer, RefreshCw, Layers, Calculator, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatDateOnly } from '../utils/format';
import { useDataRestored } from '../utils/useDataRestored';

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
      const isCooly = (Number(sale.handlingCharges) > 0 || Number(sale.coolyRate) > 0);
      const custName = sale.customer?.name || '—';
      const vendName = sale.vendor?.name || '—';

      (sale.lines || []).forEach((line) => {
        const lineBags = Number(line.bagCount) || (line.bags?.length) || 1;
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
    window.print();
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-primary-900 tracking-tight flex items-center gap-2">
            <Calculator className="w-7 h-7 text-emerald-600" />
            Hamali Report (కూలీ నివేదిక)
          </h1>
          <p className="text-xs text-primary-500 mt-1">
            Calculated Cooly / Hamali charges for sales on {formatDateOnly(date)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-primary-200 shadow-sm">
            <Calendar className="w-4 h-4 text-primary-500" />
            <input
              type="date"
              className="text-sm font-semibold text-primary-800 bg-transparent outline-none cursor-pointer"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn-secondary !py-2 !px-3 text-xs"
            onClick={loadHamaliSales}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>

          <button
            type="button"
            className="btn-primary !py-2 !px-4 text-xs"
            onClick={handlePrint}
          >
            <Printer className="w-4 h-4" /> Print / Save PDF
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="card !p-4 border-l-4 border-emerald-500 bg-gradient-to-br from-emerald-50/50 to-white">
          <p className="text-xs font-medium text-emerald-700">Total Hamali Price</p>
          <p className="text-2xl font-black text-emerald-900 mt-1">
            {formatCurrency(hamaliCalc.totalHamali)}
          </p>
          <p className="text-[10px] text-emerald-600 mt-1">Final calculated cooly amount</p>
        </div>

        <div className="card !p-4">
          <p className="text-xs font-medium text-primary-500">Sales by Weight (General)</p>
          <p className="text-xl font-bold text-primary-800 mt-1">
            {hamaliCalc.byWeightBags} <span className="text-xs font-normal text-primary-500">bags</span>
          </p>
          <p className="text-xs font-semibold text-emerald-700 mt-1">
            8 × {hamaliCalc.byWeightBags} = {formatCurrency(hamaliCalc.amtByWeight)}
          </p>
        </div>

        <div className="card !p-4">
          <p className="text-xs font-medium text-primary-500">Sales by Bag (General)</p>
          <p className="text-xl font-bold text-primary-800 mt-1">
            {hamaliCalc.byBagBags} <span className="text-xs font-normal text-primary-500">bags</span>
          </p>
          <p className="text-xs font-semibold text-emerald-700 mt-1">
            5 × {hamaliCalc.byBagBags} = {formatCurrency(hamaliCalc.amtByBag)}
          </p>
        </div>

        <div className="card !p-4">
          <p className="text-xs font-medium text-primary-500">Weight Sales + Customer Cooly</p>
          <p className="text-xl font-bold text-primary-800 mt-1">
            {hamaliCalc.byWeightCoolyBags} <span className="text-xs font-normal text-primary-500">bags</span>
          </p>
          <p className="text-xs font-semibold text-emerald-700 mt-1">
            15 × {hamaliCalc.byWeightCoolyBags} = {formatCurrency(hamaliCalc.amtByWeightCooly)}
          </p>
        </div>

        <div className="card !p-4">
          <p className="text-xs font-medium text-primary-500">Bag Sales + Customer Cooly</p>
          <p className="text-xl font-bold text-primary-800 mt-1">
            {hamaliCalc.byBagCoolyBags} <span className="text-xs font-normal text-primary-500">bags</span>
          </p>
          <p className="text-xs font-semibold text-emerald-700 mt-1">
            6 × {hamaliCalc.byBagCoolyBags} = {formatCurrency(hamaliCalc.amtByBagCooly)}
          </p>
        </div>
      </div>

      {/* Formula Breakdown Table */}
      <div className="card !p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-primary-100 bg-primary-50/50 flex items-center justify-between">
          <h2 className="font-bold text-primary-800 text-sm flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-600" /> Formula Calculation Breakdown
          </h2>
          <span className="text-xs text-primary-500 font-mono">
            Date: {formatDateOnly(date)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-primary-100/60 text-primary-800 font-semibold text-xs border-b border-primary-200">
                <th className="py-3 px-4">Formula Component Description</th>
                <th className="py-3 px-4">Sale Type</th>
                <th className="py-3 px-4">Cooly Applied</th>
                <th className="py-3 px-4 text-right">No. of Bags</th>
                <th className="py-3 px-4 text-right">Rate / Bag</th>
                <th className="py-3 px-4 text-right">Calculated Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100 font-medium">
              <tr className="hover:bg-primary-50/50">
                <td className="py-3 px-4 font-semibold text-primary-800">
                  8 × (number of bags sales happened by weight)
                </td>
                <td className="py-3 px-4 text-xs font-mono text-primary-600">By Weight</td>
                <td className="py-3 px-4 text-xs text-primary-500">All</td>
                <td className="py-3 px-4 text-right font-bold text-primary-900">{hamaliCalc.byWeightBags}</td>
                <td className="py-3 px-4 text-right text-primary-600">₹8</td>
                <td className="py-3 px-4 text-right font-bold text-emerald-700">{formatCurrency(hamaliCalc.amtByWeight)}</td>
              </tr>
              <tr className="hover:bg-primary-50/50">
                <td className="py-3 px-4 font-semibold text-primary-800">
                  5 × (number of bags sales happened by bags)
                </td>
                <td className="py-3 px-4 text-xs font-mono text-primary-600">By Bag</td>
                <td className="py-3 px-4 text-xs text-primary-500">All</td>
                <td className="py-3 px-4 text-right font-bold text-primary-900">{hamaliCalc.byBagBags}</td>
                <td className="py-3 px-4 text-right text-primary-600">₹5</td>
                <td className="py-3 px-4 text-right font-bold text-emerald-700">{formatCurrency(hamaliCalc.amtByBag)}</td>
              </tr>
              <tr className="hover:bg-primary-50/50">
                <td className="py-3 px-4 font-semibold text-primary-800">
                  15 × (number of bags sold to customer by weight with cooly)
                </td>
                <td className="py-3 px-4 text-xs font-mono text-primary-600">By Weight</td>
                <td className="py-3 px-4 text-xs font-bold text-emerald-600">Yes (Cooly Checked)</td>
                <td className="py-3 px-4 text-right font-bold text-primary-900">{hamaliCalc.byWeightCoolyBags}</td>
                <td className="py-3 px-4 text-right text-primary-600">₹15</td>
                <td className="py-3 px-4 text-right font-bold text-emerald-700">{formatCurrency(hamaliCalc.amtByWeightCooly)}</td>
              </tr>
              <tr className="hover:bg-primary-50/50">
                <td className="py-3 px-4 font-semibold text-primary-800">
                  6 × (number of bags sold to customer by bags with cooly)
                </td>
                <td className="py-3 px-4 text-xs font-mono text-primary-600">By Bag</td>
                <td className="py-3 px-4 text-xs font-bold text-emerald-600">Yes (Cooly Checked)</td>
                <td className="py-3 px-4 text-right font-bold text-primary-900">{hamaliCalc.byBagCoolyBags}</td>
                <td className="py-3 px-4 text-right text-primary-600">₹6</td>
                <td className="py-3 px-4 text-right font-bold text-emerald-700">{formatCurrency(hamaliCalc.amtByBagCooly)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-emerald-100/70 border-t-2 border-emerald-300 font-extrabold text-emerald-950">
                <td colSpan={3} className="py-3.5 px-4 text-base">
                  TOTAL HAMALI / COOLY PRICE
                </td>
                <td className="py-3.5 px-4 text-right text-base">{hamaliCalc.totalSaleBags} bags</td>
                <td className="py-3.5 px-4 text-right text-xs uppercase tracking-wide text-emerald-800">—</td>
                <td className="py-3.5 px-4 text-right text-lg text-emerald-900">
                  {formatCurrency(hamaliCalc.totalHamali)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Itemized Sales Table */}
      <div className="card !p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-primary-100 bg-primary-50/50 flex items-center justify-between">
          <h3 className="font-bold text-primary-800 text-sm">Itemized Sales Entries ({hamaliCalc.rowDetails.length})</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-primary-50 text-primary-700 font-semibold text-xs border-b border-primary-100">
                <th className="py-2.5 px-4">#</th>
                <th className="py-2.5 px-4">Customer</th>
                <th className="py-2.5 px-4">Vendor</th>
                <th className="py-2.5 px-4">Product</th>
                <th className="py-2.5 px-4 text-center">Sale Type</th>
                <th className="py-2.5 px-4 text-center">Cooly Status</th>
                <th className="py-2.5 px-4 text-right">Bags</th>
                <th className="py-2.5 px-4 text-right">Weight (kg)</th>
                <th className="py-2.5 px-4 text-right">Hamali Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100 text-xs font-medium">
              {hamaliCalc.rowDetails.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-primary-400 font-normal">
                    No sales records found for {formatDateOnly(date)}
                  </td>
                </tr>
              ) : (
                hamaliCalc.rowDetails.map((row, idx) => (
                  <tr key={`${row.saleId}-${idx}`} className="hover:bg-primary-50/40">
                    <td className="py-2.5 px-4 text-primary-400 font-mono">{idx + 1}</td>
                    <td className="py-2.5 px-4 font-semibold text-primary-800">{row.customerName}</td>
                    <td className="py-2.5 px-4 text-primary-600">{row.vendorName}</td>
                    <td className="py-2.5 px-4 text-primary-700">{row.materialName}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-primary-100 text-primary-700">
                        {row.saleType}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {row.isCooly ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-primary-400 text-[11px]">
                          <XCircle className="w-3.5 h-3.5 text-primary-300" /> No
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-primary-900">{row.bags}</td>
                    <td className="py-2.5 px-4 text-right text-primary-600">{row.weight > 0 ? row.weight : '—'}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">
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
