import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import api from '../api';
import { formatCurrency, formatDate, formatKg } from '../utils/format';

function getBagCount(bagEntries = []) {
  return bagEntries.reduce((sum, bag) => sum + (bag.kgs != null ? 1 : bag.numBags || 0), 0);
}

export default function LoadInvoice() {
  const { id } = useParams();
  const [load, setLoad] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/loads/${id}`)
      .then((res) => setLoad(res.data))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-cream text-primary-600">Loading invoice...</div>;
  }

  if (!load) {
    return <div className="min-h-screen flex items-center justify-center bg-cream text-red-600">Invoice not found</div>;
  }

  return (
    <div className="min-h-screen bg-cream p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3 print:hidden">
          <button
            type="button"
            onClick={() => window.close()}
            className="btn-secondary !py-2.5"
          >
            <ArrowLeft className="w-4 h-4" /> Close Tab
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-primary !py-2.5"
          >
            <Printer className="w-4 h-4" /> Print Invoice
          </button>
        </div>

        <div className="card !p-8 print:shadow-none print:border-0">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 border-b border-primary-100 pb-6">
            <div>
              <h1 className="text-3xl font-bold text-primary-800">Load Invoice</h1>
              <p className="text-primary-500 mt-2">AgriTrades Vendor Purchase Invoice</p>
            </div>
            <div className="text-left md:text-right">
              <p className="text-sm text-primary-500">Invoice Date</p>
              <p className="font-semibold text-primary-800">{formatDate(load.createdAt)}</p>
              <p className="text-sm text-primary-500 mt-3">Invoice ID</p>
              <p className="font-mono text-sm text-primary-700 break-all">{load._id}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-6 border-b border-primary-100">
            <div>
              <p className="text-sm text-primary-500">Vendor Name</p>
              <p className="text-xl font-bold text-primary-800 mt-1">{load.vendor?.name}</p>
              <p className="text-primary-600 mt-2">{load.vendor?.mobile}</p>
              <p className="text-primary-600">{load.vendor?.city}</p>
              <p className="text-primary-600">{load.vendor?.address}</p>
            </div>
            <div className="md:text-right">
              <p className="text-sm text-primary-500">Credit Balance After Save</p>
              <p className="text-2xl font-bold text-accent-600 mt-1">
                {formatCurrency(load.vendor?.creditBalance)}
              </p>
            </div>
          </div>

          <div className="py-6">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-primary-100">
                  <th className="py-3 pr-4 text-sm font-semibold text-primary-500">Material</th>
                  <th className="py-3 pr-4 text-sm font-semibold text-primary-500 text-right">Bags</th>
                  <th className="py-3 pr-4 text-sm font-semibold text-primary-500 text-right">Weight</th>
                  <th className="py-3 pr-4 text-sm font-semibold text-primary-500 text-right">Rate/Kg</th>
                  <th className="py-3 text-sm font-semibold text-primary-500 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {load.materials.map((mat, idx) => (
                  <tr key={idx} className="border-b border-primary-50 align-top">
                    <td className="py-4 pr-4">
                      <p className="font-semibold text-primary-800">{mat.materialName}</p>
                      <div className="mt-2 space-y-1">
                        {mat.bagEntries.map((bag, bagIdx) => (
                          <p key={bagIdx} className="text-sm text-primary-500">
                            {bag.bagType || `Bag ${bagIdx + 1}`}: {formatKg(bag.kgs ?? bag.kgPerBag)}
                          </p>
                        ))}
                      </div>
                    </td>
                    <td className="py-4 pr-4 text-right text-primary-700">{getBagCount(mat.bagEntries)}</td>
                    <td className="py-4 pr-4 text-right text-primary-700">{formatKg(mat.totalKg)}</td>
                    <td className="py-4 pr-4 text-right text-primary-700">{formatCurrency(mat.ratePerKg)}</td>
                    <td className="py-4 text-right font-semibold text-primary-800">{formatCurrency(mat.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="pt-6 text-right text-lg font-bold text-primary-800">
                    Total Buying Amount
                  </td>
                  <td className="pt-6 text-right text-2xl font-bold text-primary-800">
                    {formatCurrency(load.totalBuyingAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {load.notes && (
            <div className="border-t border-primary-100 pt-6">
              <p className="text-sm font-semibold text-primary-600">Notes</p>
              <p className="text-primary-700 mt-2 whitespace-pre-wrap">{load.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
