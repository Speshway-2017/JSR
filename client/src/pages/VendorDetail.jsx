import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Phone, MapPin, CreditCard, Pencil, X, Save, FileText, Truck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import MDIModalWindow from '../components/mdi/MDIModalWindow';
import { formatCurrency, formatDate, formatKg } from '../utils/format';
import { openVendorBillPdf } from '../utils/vendorBillPdf';
import { openCustomerSaleBillPdf } from '../utils/customerSaleBillPdf';
import { openBillPreviewTab } from '../utils/raituBillShared';
import { DEDUCTION_FIELDS, emptyRatesState, ratesPayload } from '../utils/deductionFields';
import { useTeluguPreview } from '../hooks/useTeluguPreview';
import { useDataRestored } from '../utils/useDataRestored';
import { useMDI } from '../context/MDIContext';

export default function VendorDetail({ path: windowPath }) {
  const { openWindow } = useMDI();
  const { id: routeId } = useParams();
  const id = routeId || (windowPath ? windowPath.split('/vendors/')[1]?.split('?')[0] : null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDesc, setPaymentDesc] = useState('');
  const [paying, setPaying] = useState(false);
  const [activeTab, setActiveTab] = useState('loads');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [billLoadingId, setBillLoadingId] = useState(null);
  const [billModal, setBillModal] = useState(null); // { loadId, defaults }
  const [billForm, setBillForm] = useState(() => emptyRatesState());
  const [generatingBill, setGeneratingBill] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    nameTelugu: '',
    mobile: '',
    city: '',
    address: '',
  });
  const { telugu: liveTelugu, loading: teluguLoading } = useTeluguPreview(
    editing ? editForm.name : ''
  );

  const fetchData = useCallback(() => {
    if (!id || id === 'undefined') {
      setLoading(false);
      return;
    }
    api.get(`/vendors/${id}`).then((res) => {
      setData(res.data);
      const v = res.data.vendor;
      setEditForm({
        name: v.name,
        nameTelugu: v.nameTelugu || '',
        mobile: v.mobile,
        city: v.city,
        address: v.address,
      });
    }).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id || id === 'undefined') return;
    setLoading(true);
    setEditing(false);
    setShowPayment(false);
    setBillModal(null);
    fetchData();
  }, [id, fetchData]);

  useDataRestored(fetchData);

  useEffect(() => {
    if (!editing) return;
    setEditForm((prev) => {
      if (!prev.name.trim()) return { ...prev, nameTelugu: '' };
      if (teluguLoading && !liveTelugu) return prev;
      return { ...prev, nameTelugu: liveTelugu };
    });
  }, [liveTelugu, teluguLoading, editing]);

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

  const openBillPdf = async (bill, previewTab) => {
    try {
      await openVendorBillPdf(bill, previewTab);
    } catch (err) {
      if (previewTab) previewTab.close();
      toast.error(err.message || 'Failed to open Telugu bill PDF');
    }
  };

  /** Open PDF with saved rates (bill already generated) */
  const handleViewBill = async (load) => {
    if (!load.billGenerated) {
      openBillChargesModal(load);
      return;
    }

    const previewTab = openBillPreviewTab();
    setBillLoadingId(load._id);
    try {
      const res = await api.get(`/loads/${load._id}/bill`);
      await openBillPdf(res.data, previewTab);
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
      const rates =
        load.billGenerated && res.data.ratesUsed
          ? res.data.ratesUsed
          : res.data.defaults || {};
      setBillForm(emptyRatesState(rates));
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
    const previewTab = openBillPreviewTab();
    try {
      const res = await api.post(`/loads/${billModal.loadId}/bill`, ratesPayload(billForm));
      const regenerating = billModal.regenerating;
      setBillModal(null);
      await openBillPdf(res.data, previewTab);
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
      <button
        type="button"
        onClick={() => openWindow({ path: '/vendors', title: 'Vendors' })}
        className="inline-flex items-center gap-2 text-primary-500 hover:text-primary-700 font-medium text-sm cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Vendors
      </button>

      <div className="card">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1">
            {!editing ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="page-title">{vendor.name}</h1>
                    {vendor.nameTelugu ? (
                      <p className="text-sm text-primary-500 mt-0.5">{vendor.nameTelugu}</p>
                    ) : null}
                  </div>
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
                  <div key={field}>
                    <input
                      className="input-field"
                      placeholder={field}
                      value={editForm[field]}
                      onChange={(e) => setEditForm({ ...editForm, [field]: e.target.value })}
                      required
                    />
                    {field === 'name' ? (
                      <>
                        <p className="mt-1.5 min-h-[1.5rem] text-base text-primary-700 font-medium tracking-wide">
                          {editForm.name.trim()
                            ? teluguLoading && !liveTelugu
                              ? '…'
                              : editForm.nameTelugu || liveTelugu || ''
                            : ''}
                        </p>
                        <p className="text-xs text-primary-400 -mt-1">తెలుగు</p>
                      </>
                    ) : null}
                  </div>
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

      <MDIModalWindow
        open={showPayment}
        title="Pay Vendor"
        iconName="CreditCard"
        onClose={() => setShowPayment(false)}
      >
        <form onSubmit={handlePayment} className="space-y-4">
          <p className="text-xs text-primary-400">Pay the receivable amount from the vendor bill after deductions.</p>
          <div>
            <label className="label">Amount (₹) *</label>
            <input type="number" className="input-field" min="1" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} required />
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input-field" value={paymentDesc} onChange={(e) => setPaymentDesc(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setShowPayment(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={paying}>{paying ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </MDIModalWindow>

      <MDIModalWindow
        open={!!billModal}
        title={billModal?.regenerating ? 'Update Load Bill' : 'Generate Load Bill'}
        iconName="FileText"
        onClose={() => setBillModal(null)}
      >
        <form onSubmit={handleGenerateBill} className="space-y-4">
          <p className="text-xs text-primary-400">
            {billModal?.regenerating
              ? 'Adjust deduction rates and regenerate the bill PDF for this load.'
              : 'Confirm deduction rates (from Price Settings). Toggle Per bag for each field.'}
          </p>
          <div className="grid grid-cols-[1fr_90px_72px] gap-2 text-xs font-semibold text-primary-400 uppercase">
            <span>Field</span>
            <span>Amount</span>
            <span className="text-center">Per bag</span>
          </div>
          {DEDUCTION_FIELDS.map((field) => {
            const perBag = !!billForm[`${field.key}PerBag`];
            const isPct = field.isCommission && !perBag;
            return (
              <div key={field.key} className="grid grid-cols-[1fr_90px_72px] gap-2 items-center">
                <div>
                  <p className="text-sm font-medium text-primary-800">{field.telugu}</p>
                  <p className="text-xs text-primary-400">{field.label}</p>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max={isPct ? 100 : undefined}
                    step="0.01"
                    className="input-field !py-2"
                    value={billForm[field.key]}
                    onChange={(e) => setBillForm({ ...billForm, [field.key]: e.target.value })}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-primary-400">
                    {isPct ? '%' : '₹'}
                  </span>
                </div>
                <label className="flex justify-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-primary-600"
                    checked={perBag}
                    onChange={(e) =>
                      setBillForm({ ...billForm, [`${field.key}PerBag`]: e.target.checked })
                    }
                  />
                </label>
              </div>
            );
          })}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setBillModal(null)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={generatingBill}>
              {generatingBill
                ? (billModal?.regenerating ? 'Updating...' : 'Generating...')
                : (billModal?.regenerating ? 'Update & View Bill' : 'Generate Bill')}
            </button>
          </div>
        </form>
      </MDIModalWindow>

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
                {loads.map((load) => (
                  <div
                    key={load._id}
                    className="border border-primary-100 rounded-xl flex items-center gap-2 p-3"
                  >
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <Truck className="w-4 h-4 text-primary-500 shrink-0" />
                      <span className="text-sm font-medium text-primary-700">
                        {formatDate(load.loadDate || load.createdAt)}
                      </span>
                      {load.billGenerated && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-accent-100 text-accent-700">
                          Bill done
                        </span>
                      )}
                    </div>
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
                ))}
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
                          const previewTab = openBillPreviewTab();
                          try {
                            const res = await api.get(`/sales/${sale._id}`);
                            await openCustomerSaleBillPdf(res.data, previewTab);
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
