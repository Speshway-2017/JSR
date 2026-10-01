import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, CreditCard, Pencil, X, Save, FileText, Send, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import MDIModalWindow from '../components/mdi/MDIModalWindow';
import Toggle from '../components/Toggle';
import { formatCurrency, formatDate, formatKg } from '../utils/format';
import { openCustomerSaleBillPdf, generateSingleCustomerBillHtml } from '../utils/customerSaleBillPdf';
import { openBillPreviewTab } from '../utils/raituBillShared';
import { useTeluguPreview } from '../hooks/useTeluguPreview';
import { useDataRestored } from '../utils/useDataRestored';
import { useMDI } from '../context/MDIContext';
import { sendWhatsAppBillPdf } from '../utils/whatsappSender';
import { generateAccountStatementHtml } from '../utils/statementPdf';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export default function CustomerDetail({ path: windowPath }) {
  const isOnline = useOnlineStatus();
  const { openWindow } = useMDI();
  const { id: routeId } = useParams();
  const id = routeId || (windowPath ? windowPath.split('/customers/')[1]?.split('?')[0] : null);
  const [data, setData] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDesc, setPaymentDesc] = useState('');
  const [paying, setPaying] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    nameTelugu: '',
    mobile: '',
    schedule: '',
    handlingCharges: false,
  });
  const { telugu: liveTelugu, loading: teluguLoading } = useTeluguPreview(
    editing ? editForm.name : ''
  );

  const fetchData = useCallback(() => {
    if (!id || id === 'undefined') {
      setLoading(false);
      return;
    }
    Promise.all([api.get(`/customers/${id}`), api.get('/schedules')])
      .then(([res, schedRes]) => {
        setData(res.data);
        setSchedules(schedRes.data);
        const c = res.data.customer;
        setEditForm({
          name: c.name,
          nameTelugu: c.nameTelugu || '',
          mobile: c.mobile || '',
          schedule: c.schedule?._id || c.schedule || '',
          handlingCharges: !!c.handlingCharges,
        });
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id || id === 'undefined') return;
    setLoading(true);
    setEditing(false);
    setShowPayment(false);
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
      await api.post('/transactions/customer-payment', {
        customerId: id,
        amount,
        description: paymentDesc || `Payment from ${data.customer.name}`,
      });
      toast.success('Payment recorded');
      setPaymentAmount('');
      setPaymentDesc('');
      setShowPayment(false);
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
      await api.put(`/customers/${id}`, editForm);
      toast.success('Customer updated');
      setEditing(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleHandling = async (checked) => {
    try {
      await api.put(`/customers/${id}`, { handlingCharges: checked });
      toast.success(checked ? 'Handling charges enabled' : 'Handling charges disabled');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update');
    }
  };

  const handleViewSaleBill = async (sale) => {
    const previewTab = openBillPreviewTab();
    try {
      let billSale = sale;
      if (!sale.customer?.name || !sale.lines?.length) {
        const res = await api.get(`/sales/${sale._id}`);
        billSale = res.data;
      } else {
        billSale = { ...sale, customer: data.customer };
      }
      await openCustomerSaleBillPdf(billSale, previewTab);
    } catch (err) {
      if (previewTab) previewTab.close();
      toast.error(err.response?.data?.message || 'Failed to generate bill');
    }
  };

  const handleSendWhatsAppSale = async (sale) => {
    try {
      let billSale = sale;
      if (!sale.customer?.name || !sale.lines?.length) {
        const res = await api.get(`/sales/${sale._id}`);
        billSale = res.data;
      } else {
        billSale = { ...sale, customer: data.customer };
      }
      const htmlString = await generateSingleCustomerBillHtml(billSale);
      await sendWhatsAppBillPdf({
        recipientPhone: data.customer.mobile,
        recipientName: data.customer.name,
        htmlString,
        filename: `Sale_Bill_${sale._id?.slice(-6) || 'JSR'}.pdf`,
        caption: `Dear ${data.customer.name}, your sales bill from JSR Traders is attached. Thank you!`,
      });
    } catch (err) {
      toast.error(err.message || 'Failed to send WhatsApp bill');
    }
  };

  const handleSendWhatsAppStatement = async () => {
    try {
      const htmlString = generateAccountStatementHtml({
        partyName: data.customer.name,
        partyPhone: data.customer.mobile,
        partyType: 'Customer',
        balanceLabel: 'Credit Balance',
        balanceAmount: data.customer.creditBalance,
        sales: data.sales || [],
        transactions: data.transactions || [],
      });
      await sendWhatsAppBillPdf({
        recipientPhone: data.customer.mobile,
        recipientName: data.customer.name,
        htmlString,
        filename: `Customer_Statement_${data.customer.name}.pdf`,
        caption: `Dear ${data.customer.name}, your Account Statement from JSR Traders is attached. Balance: ${formatCurrency(data.customer.creditBalance)}. Thank you!`,
        templateName: 'ledger_statement',
        templateParams: [data.customer.name, new Date().toLocaleDateString('en-IN')],
      });
    } catch (err) {
      toast.error(err.message || 'Failed to send WhatsApp statement');
    }
  };


  if (loading) return <div className="text-center py-20 text-primary-400">Loading...</div>;
  if (!data) return <div className="text-center py-20 text-primary-400">Customer not found</div>;

  const { customer, sales, transactions } = data;
  const scheduleLabel = customer.schedule?.name || '—';

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => openWindow({ path: '/customers', title: 'Customers' })}
        className="inline-flex items-center gap-1.5 text-primary-600 hover:text-primary-800 font-semibold text-xs cursor-pointer transition"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Customer List
      </button>

      <div className="card !p-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1">
            {!editing ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="page-title text-2xl font-bold text-primary-700">{customer.name}</h1>
                    {customer.nameTelugu ? (
                      <p className="text-sm text-primary-500 mt-0.5">{customer.nameTelugu}</p>
                    ) : null}
                  </div>
                  <button type="button" onClick={() => setEditing(true)} className="btn-secondary !py-1.5 !px-3 !text-xs font-semibold">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                </div>
                <p className="text-primary-600 text-xs mt-2 font-medium">Schedule: <span className="font-bold text-primary-800">{scheduleLabel}</span></p>
                {customer.mobile && <p className="text-primary-500 text-xs mt-1">Mobile: <span className="font-semibold text-primary-700">{customer.mobile}</span></p>}
                <div className="mt-3 pt-3 border-t border-primary-100">
                  <Toggle
                    checked={!!customer.handlingCharges}
                    onChange={handleToggleHandling}
                    label="Cooly"
                  />
                </div>
              </>
            ) : (
              <form onSubmit={handleSave} className="space-y-3">
                <div className="flex justify-between items-center">
                  <h2 className="font-bold text-primary-800 text-sm">Edit Customer</h2>
                  <button type="button" onClick={() => setEditing(false)} className="p-1 text-primary-400 hover:text-primary-600"><X className="w-5 h-5" /></button>
                </div>
                <div>
                  <input className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition" placeholder="Name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
                  <p className="mt-1 min-h-[1.25rem] text-sm text-primary-700 font-medium tracking-wide">
                    {editForm.name.trim()
                      ? teluguLoading && !liveTelugu
                        ? '…'
                        : editForm.nameTelugu || liveTelugu || ''
                      : ''}
                  </p>
                  <p className="text-[11px] text-primary-400 -mt-1">తెలుగు</p>
                </div>
                <input className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition" placeholder="Mobile" value={editForm.mobile} onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })} />
                <select
                  className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
                  value={editForm.schedule}
                  onChange={(e) => setEditForm({ ...editForm, schedule: e.target.value })}
                  required
                >
                  <option value="">Select schedule</option>
                  {schedules.map((s) => (
                    <option key={s._id} value={s._id}>{s.name}</option>
                  ))}
                </select>
                <Toggle checked={editForm.handlingCharges} onChange={(v) => setEditForm({ ...editForm, handlingCharges: v })} label="Cooly" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditing(false)} className="btn-secondary !py-2 !px-4 !text-sm font-semibold flex-1">Cancel</button>
                  <button type="submit" className="btn-primary !py-2 !px-4 !text-sm font-semibold flex-1" disabled={saving}><Save className="w-4 h-4" /> Save</button>
                </div>
              </form>
            )}
          </div>

          {!editing && (
            <div className="bg-accent-50/80 border border-accent-200 rounded-2xl p-4 text-center min-w-[220px] flex flex-col gap-2.5">
              <p className="text-xs text-accent-700 font-semibold uppercase tracking-wider">Credit Balance</p>
              <p className="text-3xl font-bold text-accent-700">{formatCurrency(customer.creditBalance)}</p>
              <button type="button" onClick={() => setShowPayment(true)} className="btn-primary w-full !py-2 !text-sm font-semibold flex items-center justify-center gap-1.5">
                <CreditCard className="w-4 h-4" /> Add Payment
              </button>
              {isOnline && (
                <button
                  type="button"
                  onClick={handleSendWhatsAppStatement}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow transition flex items-center justify-center gap-1.5 w-full cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" /> WhatsApp Statement
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <MDIModalWindow
        open={showPayment}
        title="Record Customer Payment"
        iconName="CreditCard"
        onClose={() => setShowPayment(false)}
      >
        <form onSubmit={handlePayment} className="space-y-3">
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

      <div className="card !p-0 overflow-hidden border border-primary-200">
        <div className="px-4 py-2.5 border-b border-primary-200 bg-primary-50/80 font-bold text-xs text-primary-700 uppercase tracking-wide">Sale History</div>
        {sales.length === 0 ? (
          <p className="text-center py-10 text-primary-400 text-xs">No sales yet</p>
        ) : (
          <div className="divide-y divide-primary-100">
            {sales.map((sale) => (
              <div key={sale._id} className="px-4 py-3 hover:bg-primary-50/30 transition">
                <div className="flex justify-between gap-3 items-start">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-primary-500">{formatDate(sale.createdAt)}</p>
                    <p className="text-xs font-semibold text-primary-700 mt-0.5">Vendor: {sale.vendor?.name}</p>
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
                    <p className="font-bold text-primary-800 text-sm">{formatCurrency(sale.totalAmount)}</p>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {sale.isPaid ? (
                        <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Paid Direct
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleViewSaleBill(sale)}
                        className="btn-secondary !py-1.5 !px-2.5 !text-xs font-semibold"
                      >
                        <FileText className="w-3.5 h-3.5" /> Bill
                      </button>
                      {isOnline && (
                        <button
                          type="button"
                          onClick={() => handleSendWhatsAppSale(sale)}
                          className="btn-secondary !py-1.5 !px-2.5 !text-xs font-semibold !bg-emerald-50 !text-emerald-700 hover:!bg-emerald-100 !border-emerald-200"
                          title="Send Bill via WhatsApp"
                        >
                          <Send className="w-3.5 h-3.5 text-emerald-600" /> WhatsApp
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card !p-0 overflow-hidden border border-primary-200">
        <div className="px-4 py-2.5 border-b border-primary-200 bg-primary-50/80 font-bold text-xs text-primary-700 uppercase tracking-wide">Payments</div>
        {transactions.filter((t) => t.type === 'customer_payment').length === 0 ? (
          <p className="text-center py-10 text-primary-400 text-xs">No payments yet</p>
        ) : (
          <div className="divide-y divide-primary-100">
            {transactions
              .filter((t) => t.type === 'customer_payment')
              .map((tx) => (
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
        )}
      </div>
    </div>
  );
}
