import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Phone, MapPin, CreditCard, Pencil, X, Save, FileText, ChevronDown, Truck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatDate, formatKg } from '../utils/format';
import { openVendorBillPdf } from '../utils/vendorBillPdf';
import { openCustomerSaleBillPdf } from '../utils/customerSaleBillPdf';

export default function VendorDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDesc, setPaymentDesc] = useState('');
  const [paying, setPaying] = useState(false);
  const [activeTab, setActiveTab] = useState('loads');
  const [expandedLoadId, setExpandedLoadId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [billLoadingId, setBillLoadingId] = useState(null);
  const [billModal, setBillModal] = useState(null); // { loadId, defaults }
  const [billForm, setBillForm] = useState({
    labour: '',
    aaseelu: '',
    bill: '',
    unionCharges: '',
    commissionPercent: '',
  });
  const [generatingBill, setGeneratingBill] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', mobile: '', city: '', address: '' });

  const fetchData = () => {
    api.get(`/vendors/${id}`).then((res) => {
      setData(res.data);
      const v = res.data.vendor;
      setEditForm({ name: v.name, mobile: v.mobile, city: v.city, address: v.address });
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [id]);

  const handlePayment = async (e) => {
    e.preventDefault();
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setPaying(true);
    try {
      await api.post('/transactions/vendor-payment', {
        vendorId: id,
        amount,
        description: paymentDesc || `Payment to ${data.vendor.name}`,
      });
      toast.success('Payment recorded');
      setPaymentAmount('');
      setPaymentDesc('');
      setShowPayment(false);
      setActiveTab('payments');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/vendors/${id}`, editForm);
      toast.success('Vendor updated');
      setEditing(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const openBillPdf = (bill, previewTab) => {
    openVendorBillPdf(bill, previewTab);
  };

  /** Open PDF with saved rates (bill already generated) */
  const handleViewBill = async (load) => {
    if (!load.billGenerated) {
      openBillChargesModal(load);
      return;
    }

    const previewTab = window.open('', '_blank');
    setBillLoadingId(load._id);
    try {
      const res = await api.get(`/loads/${load._id}/bill`);
      openBillPdf(res.data, previewTab);
    } catch (err) {
      if (previewTab) previewTab.close();
      toast.error(err.response?.data?.message || 'Failed to open bill');
    } finally {
      setBillLoadingId(null);
    }
  };

  /** Open charges modal to generate or modify & regenerate */
  const openBillChargesModal = async (load) => {
    setBillLoadingId(load._id);
    try {
      const res = await api.get(`/loads/${load._id}/bill`);
      const rates = load.billGenerated && res.data.ratesUsed
        ? res.data.ratesUsed
        : res.data.defaults || {
          labour: 0,
          aaseelu: 0,
          bill: 0,
          unionCharges: 0,
          commissionPercent: 0,
        };
      setBillForm({
        labour: rates.labour,
        aaseelu: rates.aaseelu,
        bill: rates.bill,
        unionCharges: rates.unionCharges,
        commissionPercent: rates.commissionPercent,
      });
      setBillModal({ loadId: load._id, regenerating: !!load.billGenerated });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to prepare bill');
    } finally {
      setBillLoadingId(null);
    }
  };

  const handleGenerateBill = async (e) => {
    e.preventDefault();
    if (!billModal) return;
    setGeneratingBill(true);
    const previewTab = window.open('', '_blank');
    try {
      const res = await api.post(`/loads/${billModal.loadId}/bill`, {
        labour: Number(billForm.labour) || 0,
        aaseelu: Number(billForm.aaseelu) || 0,
        bill: Number(billForm.bill) || 0,
        unionCharges: Number(billForm.unionCharges) || 0,
        commissionPercent: Number(billForm.commissionPercent) || 0,
      });
      const regenerating = billModal.regenerating;
      setBillModal(null);
      openBillPdf(res.data, previewTab);
      toast.success(regenerating ? 'Bill updated' : 'Bill generated');
      fetchData();
    } catch (err) {
      if (previewTab) previewTab.close();
      toast.error(err.response?.data?.message || 'Failed to generate bill');
    } finally {
      setGeneratingBill(false);
    }
  };

  if (loading) return <div className="text-center py-20 text-primary-400">Loading...</div>;
  if (!data) return <div className="text-center py-20 text-primary-400">Vendor not found</div>;

  const { vendor, loads, sales, transactions } = data;
  const payments = transactions.filter((t) => t.type === 'vendor_payment');

  return (
    <div className="space-y-4">
      <Link to="/vendors" className="inline-flex items-center gap-2 text-primary-500 hover:text-primary-700 font-medium text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Vendors
      </Link>

      <div className="card">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1">
            {!editing ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <h1 className="page-title">{vendor.name}</h1>
                  <button type="button" onClick={() => setEditing(true)} className="btn-secondary !py-2 !px-3 !text-sm shrink-0">
                    <Pencil className="w-4 h-4" /> Edit
                  </button>
                </div>
                <div className="flex flex-wrap gap-4 mt-3 text-primary-500 text-sm">
                  <span className="flex items-center gap-1.5"><Phone className="w-4 h-4" /> {vendor.mobile}</span>
                  <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {vendor.city}</span>
                </div>
                <p className="text-primary-400 text-sm mt-2">{vendor.address}</p>
              </>
            ) : (
              <form onSubmit={handleSave} className="space-y-3">
                <div className="flex justify-between">
                  <h2 className="font-bold text-primary-700">Edit Vendor</h2>
                  <button type="button" onClick={() => setEditing(false)}><X className="w-5 h-5 text-primary-400" /></button>
                </div>
                {['name', 'mobile', 'city', 'address'].map((field) => (
                  <input
                    key={field}
                    className="input-field"
                    placeholder={field}
                    value={editForm[field]}
                    onChange={(e) => setEditForm({ ...editForm, [field]: e.target.value })}
                    required={field !== 'address' ? true : true}
                  />
                ))}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditing(false)} className="btn-secondary flex-1">Cancel</button>
                  <button type="submit" className="btn-primary flex-1" disabled={saving}><Save className="w-4 h-4" /> Save</button>
                </div>
              </form>
            )}
          </div>

          {!editing && (
            <div className="bg-accent-50 rounded-2xl p-5 text-center min-w-[180px]">
              <p className="text-sm text-accent-600 font-medium">Payable Balance</p>
              <p className="text-3xl font-bold text-accent-700 mt-1">{formatCurrency(vendor.creditBalance)}</p>
              <button type="button" onClick={() => setShowPayment(true)} className="btn-primary w-full mt-4 !py-2.5 !text-sm">
                <CreditCard className="w-4 h-4" /> Pay Vendor
              </button>
            </div>
          )}
        </div>
      </div>

      {showPayment && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <form onSubmit={handlePayment} className="card w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-primary-700">Pay Vendor</h2>
            <p className="text-xs text-primary-400">Pay the receivable amount from the vendor bill after deductions.</p>
            <div>
              <label className="label">Amount (₹) *</label>
              <input type="number" className="input-field" min="1" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} required />
            </div>
            <div>
              <label className="label">Description</label>
              <input className="input-field" value={paymentDesc} onChange={(e) => setPaymentDesc(e.target.value)} />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowPayment(false)} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" className="btn-primary flex-1" disabled={paying}>{paying ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      {billModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleGenerateBill} className="card w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-primary-700">
                {billModal.regenerating ? 'Update Load Bill' : 'Generate Load Bill'}
              </h2>
              <button type="button" onClick={() => setBillModal(null)} className="p-1">
                <X className="w-5 h-5 text-primary-400" />
              </button>
            </div>
            <p className="text-xs text-primary-400">
              {billModal.regenerating
                ? 'Adjust deduction rates and regenerate the bill PDF for this load.'
                : 'Confirm deduction rates (from Price Settings). You can change them later and regenerate.'}
            </p>
            {[
              { key: 'labour', label: 'Labour', suffix: '₹ / bag' },
              { key: 'aaseelu', label: 'Aaseelu', suffix: '₹ / bag' },
              { key: 'bill', label: 'Bill', suffix: '₹ / bag' },
              { key: 'unionCharges', label: 'Union Charges', suffix: '₹ / bag' },
              { key: 'commissionPercent', label: 'Commission', suffix: '%' },
            ].map(({ key, label, suffix }) => (
              <div key={key}>
                <label className="label">
                  {label} <span className="font-normal text-primary-400">({suffix})</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max={key === 'commissionPercent' ? 100 : undefined}
                  step="0.01"
                  className="input-field"
                  value={billForm[key]}
                  onChange={(e) => setBillForm({ ...billForm, [key]: e.target.value })}
                />
              </div>
            ))}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setBillModal(null)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button type="submit" className="btn-primary flex-1" disabled={generatingBill}>
                {generatingBill
                  ? (billModal.regenerating ? 'Updating...' : 'Generating...')
                  : (billModal.regenerating ? 'Update & View Bill' : 'Generate Bill')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card !p-0 overflow-hidden">
        <div className="flex border-b border-primary-100">
          {[
            { id: 'loads', label: 'Loads', count: loads.length },
            { id: 'sales', label: 'Sales', count: sales.length },
            { id: 'payments', label: 'Payments', count: payments.length },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-3 py-3 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-primary-100 text-primary-700 border-b-2 border-primary-400'
                  : 'text-primary-500 hover:bg-primary-50'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        <div className="p-4">
          {activeTab === 'loads' && (
            loads.length === 0 ? (
              <p className="text-center py-10 text-primary-400 text-sm">No loads yet</p>
            ) : (
              <div className="space-y-2">
                {loads.map((load) => {
                  const open = expandedLoadId === load._id;
                  const soldOut = load.status === 'sold_out';
                  return (
                    <div key={load._id} className="border border-primary-100 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-2 p-3">
                        <button
                          type="button"
                          onClick={() => setExpandedLoadId(open ? null : load._id)}
                          className="flex-1 flex items-center justify-between gap-3 hover:bg-primary-50 text-left rounded-lg -m-1 p-1"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <ChevronDown className={`w-4 h-4 text-primary-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
                            <Truck className="w-4 h-4 text-primary-500 shrink-0" />
                            <span className="text-sm text-primary-600">{formatDate(load.createdAt)}</span>
                            <span
                              className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                                soldOut
                                  ? 'bg-accent-100 text-accent-700'
                                  : 'bg-primary-100 text-primary-600'
                              }`}
                            >
                              {soldOut ? 'Sold out' : 'Pending load'}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-primary-700 shrink-0">
                            {formatKg(load.remainingWeight ?? load.totalWeight)}
                            {!soldOut && load.soldWeight > 0 && (
                              <span className="font-normal text-primary-400 text-xs ml-1">
                                / {formatKg(load.totalWeight)}
                              </span>
                            )}
                          </span>
                        </button>
                        {load.billGenerated ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleViewBill(load)}
                              disabled={billLoadingId === load._id}
                              className="btn-secondary !py-1.5 !px-2.5 !text-xs disabled:opacity-50"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              {billLoadingId === load._id ? '...' : 'View'}
                            </button>
                            <button
                              type="button"
                              onClick={() => openBillChargesModal(load)}
                              disabled={billLoadingId === load._id}
                              className="btn-secondary !py-1.5 !px-2.5 !text-xs disabled:opacity-50"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Modify
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openBillChargesModal(load)}
                            disabled={billLoadingId === load._id}
                            className="btn-secondary !py-1.5 !px-2.5 !text-xs shrink-0 disabled:opacity-50"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            {billLoadingId === load._id ? '...' : 'Bill'}
                          </button>
                        )}
                      </div>
                      {open && (
                        <div className="px-4 pb-3 border-t border-primary-100 space-y-2 pt-2">
                          {load.handlingCharges > 0 && (
                            <p className="text-sm text-accent-600">Handling: {formatCurrency(load.handlingCharges)}</p>
                          )}
                          {load.materials.map((mat, i) => (
                            <div key={i} className="bg-primary-50 rounded-lg px-3 py-2 text-sm flex justify-between gap-2">
                              <span>
                                <span className="font-medium text-primary-700">{mat.materialName}</span>
                                <span className="text-primary-500"> — {formatKg(mat.totalKg)}</span>
                              </span>
                              <span className="text-xs text-primary-400 shrink-0">
                                {soldOut
                                  ? 'Sold out'
                                  : `${formatKg(mat.remainingKg ?? mat.totalKg)} left`}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {activeTab === 'sales' && (
            sales.length === 0 ? (
              <p className="text-center py-10 text-primary-400 text-sm">No sales from this vendor stock</p>
            ) : (
              <div className="divide-y divide-primary-100 -mx-4">
                {sales.map((sale) => (
                  <div key={sale._id} className="px-4 py-3 flex justify-between gap-3 items-start">
                    <div className="min-w-0">
                      <p className="text-sm text-primary-500">{formatDate(sale.createdAt)}</p>
                      <p className="text-sm text-primary-600">To: {sale.customer?.name}</p>
                      <div className="mt-1 space-y-0.5">
                        {Object.values(
                          (sale.lines || []).reduce((acc, l) => {
                            const name = l.materialName;
                            if (!acc[name]) acc[name] = { materialName: name, bagCount: 0, totalKg: 0 };
                            acc[name].bagCount += l.bagCount || 0;
                            acc[name].totalKg += l.totalKg || 0;
                            return acc;
                          }, {})
                        ).map((l) => (
                          <p key={l.materialName} className="text-xs text-primary-400">
                            {l.materialName} · {l.bagCount} bags · {formatKg(l.totalKg)}
                          </p>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <p className="font-semibold text-primary-700">
                        {formatCurrency(sale.lines?.reduce((s, l) => s + l.totalAmount, 0) || 0)}
                      </p>
                      <button
                        type="button"
                        onClick={async () => {
                          const previewTab = window.open('', '_blank');
                          try {
                            const res = await api.get(`/sales/${sale._id}`);
                            openCustomerSaleBillPdf(res.data, previewTab);
                          } catch (err) {
                            if (previewTab) previewTab.close();
                            toast.error(err.response?.data?.message || 'Failed to generate bill');
                          }
                        }}
                        className="btn-secondary !py-1.5 !px-2.5 !text-xs"
                      >
                        <FileText className="w-3.5 h-3.5" /> Bill
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {activeTab === 'payments' && (
            payments.length === 0 ? (
              <p className="text-center py-10 text-primary-400 text-sm">No payments yet</p>
            ) : (
              <div className="divide-y divide-primary-100 -mx-4">
                {payments.map((tx) => (
                  <div key={tx._id} className="px-4 py-3 flex justify-between">
                    <div>
                      <p className="text-sm text-primary-600">{tx.description}</p>
                      <p className="text-xs text-primary-400">{formatDate(tx.createdAt)}</p>
                    </div>
                    <p className="font-semibold text-primary-700">-{formatCurrency(tx.amount)}</p>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
