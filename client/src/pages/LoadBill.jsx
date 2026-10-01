import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatDate, formatKg } from '../utils/format';
import { openVendorBillPdf } from '../utils/vendorBillPdf';

export default function LoadBill() {
  const { loadId } = useParams();
  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/loads/${loadId}/bill`)
      .then((res) => {
        setBill(res.data);
        openVendorBillPdf(res.data).catch(() => toast.error('Failed to open Telugu bill PDF'));
      })
      .catch(() => {
        setBill(null);
        toast.error('Failed to load bill');
      })
      .finally(() => setLoading(false));
  }, [loadId]);

  const d = bill?.summary?.deductions;
  const vendorId = bill?.vendor?._id;

  return (
    <div className="space-y-3 max-w-3xl">
      <Link
        to={vendorId ? `/vendors/${vendorId}` : '/vendors'}
        className="inline-flex items-center gap-1.5 text-primary-600 hover:text-primary-800 font-semibold text-xs transition"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Vendor
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title text-2xl font-bold text-primary-700 flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary-600" /> Load Bill
          </h1>
          {bill && (
            <p className="text-xs text-primary-500 mt-1">
              <span className="font-semibold text-primary-700">{bill.vendor.name}</span> — {formatDate(bill.load.createdAt)}
              {' · '}
              <span className={bill.load.status === 'sold_out' ? 'text-accent-600 font-bold' : 'text-primary-600 font-semibold'}>
                {bill.load.status === 'sold_out' ? 'Sold out' : 'Pending'}
              </span>
            </p>
          )}
        </div>
        {bill && (
          <button
            type="button"
            onClick={() =>
              openVendorBillPdf(bill).catch(() => toast.error('Failed to open Telugu bill PDF'))
            }
            className="btn-primary !py-1.5 !px-3.5 !text-sm font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <FileText className="w-4 h-4" /> Open PDF
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-primary-400 text-xs">Loading bill...</div>
      ) : !bill ? (
        <div className="card text-center py-12 text-primary-400 text-xs">Could not load bill</div>
      ) : (
        <div className="card space-y-4 !p-4 border border-primary-200">
          <div className="flex flex-wrap gap-4 text-xs font-semibold text-primary-700 bg-primary-50/70 p-2.5 rounded-lg border border-primary-200">
            <span>Load: <span className="font-bold text-primary-800">{formatKg(bill.load.totalWeight)}</span></span>
            <span>Sold: <span className="font-bold text-primary-800">{formatKg(bill.load.soldWeight)}</span></span>
            <span>Left: <span className="font-bold text-primary-800">{formatKg(bill.load.remainingWeight)}</span></span>
          </div>

          {bill.materials.length === 0 ? (
            <p className="text-center text-primary-400 py-8 text-xs">No sales from this load yet</p>
          ) : (
            bill.materials.map((mat) => (
              <div key={mat.materialName} className="space-y-1.5">
                <h2 className="font-bold text-primary-800 text-sm">{mat.materialName}</h2>
                <div className="space-y-1">
                  {mat.lines.map((line, i) => (
                    <div key={i} className="flex justify-between gap-3 text-xs text-primary-700 border-b border-primary-100 pb-1">
                      <span>
                        {line.bagCount} bags — {formatKg(line.totalKg)} — {formatCurrency(line.ratePerKg)}/kg
                      </span>
                      <span className="font-bold text-primary-800 shrink-0">{formatCurrency(line.totalAmount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          <div className="border-t border-primary-200 pt-3 space-y-2">
            <div className="flex justify-between font-bold text-sm text-primary-800">
              <span>Total Amount</span>
              <span>{formatCurrency(bill.summary.grossTotal)}</span>
            </div>

            <p className="text-xs font-bold text-primary-700 uppercase tracking-wide pt-2">Deductions</p>
            <div className="flex justify-between text-xs font-medium text-primary-600">
              <span>Handling Charges</span>
              <span>-{formatCurrency(d.handlingCharges)}</span>
            </div>
            <div className="flex justify-between text-xs font-medium text-primary-600">
              <span>Labour ({bill.summary.totalBags} × {formatCurrency(d.perBagRates.labour)})</span>
              <span>-{formatCurrency(d.labour)}</span>
            </div>
            <div className="flex justify-between text-xs font-medium text-primary-600">
              <span>Aaseelu ({bill.summary.totalBags} × {formatCurrency(d.perBagRates.aaseelu)})</span>
              <span>-{formatCurrency(d.aaseelu)}</span>
            </div>
            <div className="flex justify-between text-xs font-medium text-primary-600">
              <span>Bill ({bill.summary.totalBags} × {formatCurrency(d.perBagRates.bill)})</span>
              <span>-{formatCurrency(d.bill)}</span>
            </div>
            <div className="flex justify-between text-xs font-medium text-primary-600">
              <span>Union Charges ({bill.summary.totalBags} × {formatCurrency(d.perBagRates.unionCharges)})</span>
              <span>-{formatCurrency(d.unionCharges)}</span>
            </div>
            <div className="flex justify-between text-xs font-medium text-primary-600">
              <span>Commission ({d.commissionPercent || 0}%)</span>
              <span>-{formatCurrency(d.commission || 0)}</span>
            </div>

            <div className="flex justify-between items-center bg-accent-50/80 border border-accent-200 rounded-xl px-4 py-3 mt-3">
              <span className="font-bold text-primary-800 text-sm">Total Receivable</span>
              <span className="text-2xl font-bold text-accent-700">{formatCurrency(bill.summary.receivable)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
