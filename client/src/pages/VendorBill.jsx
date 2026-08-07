import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import api from '../api';
import { formatCurrency, formatKg } from '../utils/format';

export default function VendorBill() {
  const { id } = useParams();
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(today);
  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchBill = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    api
      .get(`/vendors/${id}/bill?${params}`)
      .then((res) => setBill(res.data))
      .catch(() => setBill(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchBill();
  }, [id]);

  const d = bill?.summary?.deductions;

  return (
    <div className="space-y-4 max-w-3xl">
      <Link to={`/vendors/${id}`} className="inline-flex items-center gap-2 text-primary-500 hover:text-primary-700 font-medium text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Vendor
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FileText className="w-7 h-7 text-primary-500" /> Vendor Bill
          </h1>
          {bill && <p className="text-primary-400 text-sm mt-0.5">{bill.vendor.name} — {bill.vendor.city}</p>}
        </div>
      </div>

      <div className="card !p-3 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-primary-400">From</label>
          <input type="date" className="input-field !py-2 !text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-primary-400">To</label>
          <input type="date" className="input-field !py-2 !text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <button type="button" onClick={fetchBill} className="btn-primary !py-2 !px-4 !text-sm">Apply</button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-primary-400">Loading bill...</div>
      ) : !bill ? (
        <div className="card text-center py-12 text-primary-400">Could not load bill</div>
      ) : (
        <div className="card space-y-6">
          {bill.materials.length === 0 ? (
            <p className="text-center text-primary-400 py-8">No sales in this period</p>
          ) : (
            bill.materials.map((mat) => (
              <div key={mat.materialName}>
                <h2 className="font-bold text-primary-700 text-lg mb-2">{mat.materialName}</h2>
                <div className="space-y-1.5">
                  {mat.lines.map((line, i) => (
                    <div key={i} className="flex justify-between gap-3 text-sm text-primary-600 border-b border-primary-50 pb-1.5">
                      <span>
                        {line.bagCount} bags — {formatKg(line.totalKg)} — {formatCurrency(line.ratePerKg)}/kg
                      </span>
                      <span className="font-semibold text-primary-700 shrink-0">{formatCurrency(line.totalAmount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          <div className="border-t border-primary-200 pt-4 space-y-2">
            <div className="flex justify-between font-semibold text-primary-700">
              <span>Total Amount</span>
              <span>{formatCurrency(bill.summary.grossTotal)}</span>
            </div>

            <p className="text-xs font-semibold text-primary-400 uppercase tracking-wide pt-3">Deductions</p>
            <div className="flex justify-between text-sm text-primary-600">
              <span>Handling Charges</span>
              <span>-{formatCurrency(d.handlingCharges)}</span>
            </div>
            <div className="flex justify-between text-sm text-primary-600">
              <span>Labour ({bill.summary.totalBags} × {formatCurrency(d.perBagRates.labour)})</span>
              <span>-{formatCurrency(d.labour)}</span>
            </div>
            <div className="flex justify-between text-sm text-primary-600">
              <span>Aaseelu ({bill.summary.totalBags} × {formatCurrency(d.perBagRates.aaseelu)})</span>
              <span>-{formatCurrency(d.aaseelu)}</span>
            </div>
            <div className="flex justify-between text-sm text-primary-600">
              <span>Bill ({bill.summary.totalBags} × {formatCurrency(d.perBagRates.bill)})</span>
              <span>-{formatCurrency(d.bill)}</span>
            </div>
            <div className="flex justify-between text-sm text-primary-600">
              <span>Union Charges ({bill.summary.totalBags} × {formatCurrency(d.perBagRates.unionCharges)})</span>
              <span>-{formatCurrency(d.unionCharges)}</span>
            </div>
            <div className="flex justify-between text-sm text-primary-600">
              <span>Commission ({d.commissionPercent || 0}%)</span>
              <span>-{formatCurrency(d.commission || 0)}</span>
            </div>

            <div className="flex justify-between items-center bg-primary-50 rounded-xl px-4 py-3 mt-4">
              <span className="font-bold text-primary-700">Total Receivable</span>
              <span className="text-2xl font-bold text-accent-600">{formatCurrency(bill.summary.receivable)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
