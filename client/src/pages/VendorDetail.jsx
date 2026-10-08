import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Phone, MapPin, CreditCard, Pencil, X, Save, FileText, Truck, Send,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import MDIModalWindow from '../components/mdi/MDIModalWindow';
import { formatCurrency, formatDate, formatKg } from '../utils/format';
import { openVendorBillPdf, generateSingleVendorBillHtml } from '../utils/vendorBillPdf';
import { openCustomerSaleBillPdf } from '../utils/customerSaleBillPdf';
import { openBillPreviewTab } from '../utils/raituBillShared';
import { DEDUCTION_FIELDS, emptyRatesState, ratesPayload } from '../utils/deductionFields';
import { useTeluguPreview } from '../hooks/useTeluguPreview';
import { useDataRestored } from '../utils/useDataRestored';
import { useMDI } from '../context/MDIContext';
import { sendWhatsAppBillPdf } from '../utils/whatsappSender';
import { generateAccountStatementHtml } from '../utils/statementPdf';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export default function VendorDetail({ path: windowPath }) {
  const isOnline = useOnlineStatus();

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

  const handleSendWhatsAppVendorLoad = async (load) => {
    try {
      const res = await api.get(`/loads/${load._id}/bill`);
      const htmlString = await generateSingleVendorBillHtml(res.data);
      await sendWhatsAppBillPdf({
        recipientPhone: data.vendor.mobile,
        recipientName: data.vendor.name,
        htmlString,
        filename: `Vendor_Load_Bill_${load._id?.slice(-6) || 'JSR'}.pdf`,
        caption: `Dear ${data.vendor.name}, your Paddy Load Bill from JSR Traders is attached. Thank you!`,
      });
    } catch (err) {
      toast.error(err.message || 'Failed to send WhatsApp bill');
    }
  };

  const handleSendWhatsAppVendorStatement = async () => {
    try {
      const htmlString = generateAccountStatementHtml({
        partyName: data.vendor.name,
        partyPhone: data.vendor.mobile,
        partyType: 'Vendor',
        balanceLabel: 'Payable Balance',
        balanceAmount: data.vendor.creditBalance,
        loads: data.loads || [],
        transactions: data.transactions || [],
      });
      await sendWhatsAppBillPdf({
        recipientPhone: data.vendor.mobile,
        recipientName: data.vendor.name,
        htmlString,
        filename: `Vendor_Statement_${data.vendor.name}.pdf`,
        caption: `Dear ${data.vendor.name}, your Account Statement from JSR Traders is attached. Balance: ${formatCurrency(data.vendor.creditBalance)}. Thank you!`,
        templateName: 'ledger_statement',
        templateParams: [data.vendor.name, new Date().toLocaleDateString('en-IN')],
      });
    } catch (err) {
      toast.error(err.message || 'Failed to send WhatsApp statement');
    }
  };

  if (loading) return <div className="text-center py-20 text-primary-400">Loading...</div>;
  if (!data) return <div className="text-center py-20 text-primary-400">Vendor not found</div>;

  const { vendor, loads, sales, transactions } = data;
  const payments = transactions.filter((t) => t.type === 'vendor_payment');

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => openWindow({ path: '/vendors', title: 'Vendors' })}
        className="inline-flex items-center gap-1.5 text-primary-600 hover:text-primary-800 font-semibold text-xs cursor-pointer transition"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Vendors
      </button>

      <div className="card !p-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1">
            {!editing ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="page-title text-2xl font-bold text-primary-700">{vendor.name}</h1>
                    {vendor.nameTelugu ? (
                      <p className="text-sm text-primary-500 mt-0.5">{vendor.nameTelugu}</p>
                    ) : null}
                  </div>
                  <button type="button" onClick={() => setEditing(true)} className="btn-secondary !py-1.5 !px-3 !text-xs font-semibold shrink-0">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                </div>
                <div className="flex flex-wrap gap-4 mt-2.5 text-primary-600 text-xs font-medium">
                  <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-primary-500" /> {vendor.mobile}</span>
                  <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-primary-500" /> {vendor.city}</span>
                </div>
                <p className="text-primary-500 text-xs mt-1.5">{vendor.address}</p>
              </>
            ) : (
              <form onSubmit={handleSave} className="space-y-3">
                <div className="flex justify-between items-center">
                  <h2 className="font-bold text-primary-800 text-sm">Edit Vendor</h2>
                  <button type="button" onClick={() => setEditing(false)} className="p-1 text-primary-400 hover:text-primary-600"><X className="w-5 h-5" /></button>
                </div>
                {['name', 'mobile', 'city', 'address'].map((field) => (
                  <div key={field}>
                    <input
                      className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
                      placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                      value={editForm[field]}
                      onChange={(e) => setEditForm({ ...editForm, [field]: e.target.value })}
                      required
                    />
                    {field === 'name' ? (
                      <>
                        <p className="mt-1 min-h-[1.25rem] text-sm text-primary-700 font-medium tracking-wide">
                          {editForm.name.trim()
                            ? teluguLoading && !liveTelugu
                              ? '…'
                              : editForm.nameTelugu || liveTelugu || ''
                            : ''}
                        </p>
                        <p className="text-[11px] text-primary-400 -mt-1">తెలుగు</p>
                      </>
                    ) : null}
                  </div>
                ))}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditing(false)} className="btn-secondary !py-2 !px-4 !text-sm font-semibold flex-1">Cancel</button>
                  <button type="submit" className="btn-primary !py-2 !px-4 !text-sm font-semibold flex-1" disabled={saving}><Save className="w-4 h-4" /> Save</button>
                </div>
              </form>
            )}
          </div>

          {!editing && (
            <div className="bg-accent-50/80 border border-accent-200 rounded-2xl p-4 text-center min-w-[220px] flex flex-col gap-2.5">
              <p className="text-xs text-accent-700 font-semibold uppercase tracking-wider">Payable Balance</p>
              <p className="text-3xl font-bold text-accent-700">{formatCurrency(vendor.creditBalance)}</p>
              <button type="button" onClick={() => setShowPayment(true)} className="btn-primary w-full !py-2 !text-sm font-semibold flex items-center justify-center gap-1.5">
                <CreditCard className="w-4 h-4" /> Pay Vendor
              </button>
              {isOnline && (
                <button
                  type="button"
                  onClick={handleSendWhatsAppVendorStatement}
                  className="btn-secondary !py-2 !text-xs font-bold w-full flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Send className="w-3.5 h-3.5 text-primary-600" /> WhatsApp Statement
                </button>
              )}
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
        <form onSubmit={handlePayment} className="space-y-3">
          <p className="text-xs text-primary-500">Pay the receivable amount from the vendor bill after deductions.</p>
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">Amount (₹) *</label>
            <input type="number" className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition" min="1" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">Description</label>
            <input className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition" value={paymentDesc} onChange={(e) => setPaymentDesc(e.target.value)} placeholder="Optional" />
          </div>
          <div className="sticky bottom-0 bg-surface/95 backdrop-blur-xs pt-2.5 pb-0.5 border-t border-primary-100 flex gap-3 mt-2 z-10">
            <button type="button" onClick={() => setShowPayment(false)} className="btn-secondary !py-2 !px-4 !text-sm font-semibold flex-1">Cancel</button>
            <button type="submit" className="btn-primary !py-2 !px-4 !text-sm font-semibold flex-1" disabled={paying}>{paying ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </MDIModalWindow>

      <MDIModalWindow
        open={!!billModal}
        title={billModal?.regenerating ? 'Update Load Bill' : 'Generate Load Bill'}
        iconName="FileText"
        onClose={() => setBillModal(null)}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleGenerateBill} className="space-y-3">
          <p className="text-xs text-primary-500">
            {billModal?.regenerating
              ? 'Adjust deduction rates and regenerate the bill PDF for this load.'
              : 'Confirm deduction rates (from Price Settings). Toggle Per bag for each field.'}
          </p>
          <div className="grid grid-cols-[1fr_90px_72px] gap-2 text-xs font-semibold text-primary-600 uppercase">
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
                  <p className="text-xs text-primary-500">{field.label}</p>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max={isPct ? 100 : undefined}
                    step="0.01"
                    className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
                    value={billForm[field.key]}
                    onChange={(e) => setBillForm({ ...billForm, [field.key]: e.target.value })}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-primary-400">
                    {isPct ? '%' : '₹'}
                  </span>
                </div>
                <label className="flex justify-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-primary-300 text-primary-600 focus:ring-primary-400 accent-primary-600 cursor-pointer"
                    checked={perBag}
                    onChange={(e) =>
                      setBillForm({ ...billForm, [`${field.key}PerBag`]: e.target.checked })
                    }
                  />
                </label>
              </div>
            );
          })}
          <div className="sticky bottom-0 bg-surface/95 backdrop-blur-xs pt-2.5 pb-0.5 border-t border-primary-100 flex gap-3 mt-2 z-10">
            <button type="button" onClick={() => setBillModal(null)} className="btn-secondary !py-2 !px-4 !text-sm font-semibold flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary !py-2 !px-4 !text-sm font-semibold flex-1" disabled={generatingBill}>
              {generatingBill
                ? (billModal?.regenerating ? 'Updating...' : 'Generating...')
                : (billModal?.regenerating ? 'Update & View Bill' : 'Generate Bill')}
            </button>
          </div>
        </form>
      </MDIModalWindow>

      <div className="card !p-0 overflow-hidden border border-primary-200">
        <div className="flex border-b border-primary-200 bg-primary-50/50">
          {[
            { id: 'loads', label: 'Loads', count: loads.length },
            { id: 'sales', label: 'Sales', count: sales.length },
            { id: 'payments', label: 'Payments', count: payments.length },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-3 text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-primary-100/80 text-primary-800 border-b-2 border-primary-600'
                  : 'text-primary-500 hover:bg-primary-50 hover:text-primary-700'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        <div className="p-3">
          {activeTab === 'loads' && (
            loads.length === 0 ? (
              <p className="text-center py-10 text-primary-400 text-xs">No loads yet</p>
            ) : (
              <div className="space-y-2">
                {loads.map((load) => (
                  <div
                    key={load._id}
                    className="border border-primary-200 rounded-xl flex items-center justify-between gap-3 p-3 bg-surface hover:bg-primary-50/20 transition"
                  >
                    <div className="flex-1 flex items-center gap-2.5 min-w-0">
                      <Truck className="w-4 h-4 text-primary-500 shrink-0" />
                      <span className="text-xs font-semibold text-primary-800">
                        {formatDate(load.loadDate || load.createdAt)}
                      </span>
                      {load.billGenerated && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent-100 text-accent-800 border border-accent-200">
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
                          className="btn-secondary !py-1.5 !px-2.5 !text-xs font-semibold disabled:opacity-50"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          {billLoadingId === load._id ? '...' : 'View'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openBillChargesModal(load)}
                          disabled={billLoadingId === load._id}
                          className="btn-secondary !py-1.5 !px-2.5 !text-xs font-semibold disabled:opacity-50"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Modify
                        </button>
                        {isOnline && (
                          <button
                            type="button"
                            onClick={() => handleSendWhatsAppVendorLoad(load)}
                            disabled={billLoadingId === load._id}
                            className="btn-secondary !py-1.5 !px-2.5 !text-xs font-semibold"
                            title="Send Load Bill via WhatsApp"
                          >
                            <Send className="w-3.5 h-3.5 text-primary-600" /> WhatsApp
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openBillChargesModal(load)}
                        disabled={billLoadingId === load._id}
                        className="btn-secondary !py-1.5 !px-2.5 !text-xs font-semibold shrink-0 disabled:opacity-50"
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
              <p className="text-center py-10 text-primary-400 text-xs">No sales from this vendor stock</p>
            ) : (
              <div className="divide-y divide-primary-100 -mx-3">
                {sales.map((sale) => (
                  <div key={sale._id} className="px-4 py-3 flex justify-between gap-3 items-start hover:bg-primary-50/30 transition">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-primary-500">{formatDate(sale.createdAt)}</p>
                      <p className="text-xs font-semibold text-primary-700 mt-0.5">To: {sale.customer?.name}</p>
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
                          <p key={l.materialName} className="text-xs text-primary-600">
                            <span className="font-semibold text-primary-800">{l.materialName}</span> · {l.bagCount} bags · {formatKg(l.totalKg)}
                          </p>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <p className="font-bold text-primary-800 text-sm">
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
                        className="btn-secondary !py-1.5 !px-2.5 !text-xs font-semibold"
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
              <p className="text-center py-10 text-primary-400 text-xs">No payments yet</p>
            ) : (
              <div className="divide-y divide-primary-100 -mx-3">
                {payments.map((tx) => (
                  <div key={tx._id} className="px-4 py-3 flex justify-between items-center hover:bg-primary-50/30 transition">
                    <div>
                      <p className="text-xs font-semibold text-primary-700">
                        {tx.description}
                        {tx.reason ? <span className="ml-1 text-xs text-primary-500 italic">({tx.reason})</span> : null}
                      </p>
                      <p className="text-xs text-primary-400 mt-0.5">{formatDate(tx.createdAt)}</p>
                    </div>
                    <p className="font-bold text-primary-800 text-sm">-{formatCurrency(tx.amount)}</p>
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
