import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, CreditCard, Pencil, X, Save, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import Toggle from '../components/Toggle';
import { formatCurrency, formatDate, formatKg } from '../utils/format';
import { openCustomerSaleBillPdf } from '../utils/customerSaleBillPdf';
import { openBillPreviewTab } from '../utils/raituBillShared';
import { useTeluguPreview } from '../hooks/useTeluguPreview';

export default function CustomerDetail() {
  const { id } = useParams();
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

  const fetchData = () => {
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
  };

  useEffect(() => {
    fetchData();
  }, [id]);

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

  if (loading) return <div className="text-center py-20 text-primary-400">Loading...</div>;
  if (!data) return <div className="text-center py-20 text-primary-400">Customer not found</div>;

  const { customer, sales, transactions } = data;
  const scheduleLabel = customer.schedule?.name || '—';

  return (
    <div className="space-y-4">
      <Link to="/customers" className="inline-flex items-center gap-2 text-primary-500 hover:text-primary-700 font-medium text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Customer List
      </Link>

      <div className="card">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1">
            {!editing ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="page-title">{customer.name}</h1>
                    {customer.nameTelugu ? (
                      <p className="text-sm text-primary-500 mt-0.5">{customer.nameTelugu}</p>
                    ) : null}
                  </div>
                  <button type="button" onClick={() => setEditing(true)} className="btn-secondary !py-2 !px-3 !text-sm">
                    <Pencil className="w-4 h-4" /> Edit
                  </button>
                </div>
                <p className="text-primary-500 mt-2">Schedule: {scheduleLabel}</p>
                {customer.mobile && <p className="text-primary-500 text-sm mt-1">{customer.mobile}</p>}
                <div className="mt-4 pt-4 border-t border-primary-100">
                  <Toggle
                    checked={!!customer.handlingCharges}
                    onChange={handleToggleHandling}
                    label="Cooly"
                  />
                </div>
              </>
            ) : (
              <form onSubmit={handleSave} className="space-y-3">
                <div className="flex justify-between">
                  <h2 className="font-bold text-primary-700">Edit Customer</h2>
                  <button type="button" onClick={() => setEditing(false)} className="p-1"><X className="w-5 h-5 text-primary-400" /></button>
                </div>
                <div>
                  <input className="input-field" placeholder="Name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
                  <p className="mt-1.5 min-h-[1.5rem] text-base text-primary-700 font-medium tracking-wide">
                    {editForm.name.trim()
                      ? teluguLoading && !liveTelugu
                        ? '…'
                        : editForm.nameTelugu || liveTelugu || ''
                      : ''}
                  </p>
                  <p className="text-xs text-primary-400 -mt-1">తెలుగు</p>
                </div>
                <input className="input-field" placeholder="Mobile" value={editForm.mobile} onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })} />
                <select
                  className="input-field"
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
                  <button type="button" onClick={() => setEditing(false)} className="btn-secondary flex-1">Cancel</button>
                  <button type="submit" className="btn-primary flex-1" disabled={saving}><Save className="w-4 h-4" /> Save</button>
                </div>
              </form>
            )}
          </div>

          {!editing && (
            <div className="bg-accent-50 rounded-2xl p-5 text-center min-w-[180px]">
              <p className="text-sm text-accent-600 font-medium">Credit Balance</p>
              <p className="text-3xl font-bold text-accent-700 mt-1">{formatCurrency(customer.creditBalance)}</p>
              <button type="button" onClick={() => setShowPayment(true)} className="btn-primary w-full mt-4 !py-2.5 !text-sm">
                <CreditCard className="w-4 h-4" /> Add Payment
              </button>
            </div>
          )}
        </div>
      </div>

      {showPayment && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <form onSubmit={handlePayment} className="card w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold text-primary-700">Record Customer Payment</h2>
            <div>
              <label className="label">Amount (₹) *</label>
              <input type="number" className="input-field" min="1" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} required />
            </div>
            <div>
              <label className="label">Description</label>
              <input className="input-field" value={paymentDesc} onChange={(e) => setPaymentDesc(e.target.value)} placeholder="Optional" />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowPayment(false)} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" className="btn-primary flex-1" disabled={paying}>{paying ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="card !p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-primary-100 font-semibold text-primary-700">Sale History</div>
        {sales.length === 0 ? (
          <p className="text-center py-10 text-primary-400 text-sm">No sales yet</p>
        ) : (
          <div className="divide-y divide-primary-100">
            {sales.map((sale) => (
              <div key={sale._id} className="px-4 py-3">
                <div className="flex justify-between gap-3 items-start">
                  <div className="min-w-0">
                    <p className="text-sm text-primary-500">{formatDate(sale.createdAt)}</p>
                    <p className="text-sm text-primary-600">Vendor: {sale.vendor?.name}</p>
                    <div className="mt-1.5 space-y-0.5">
                      {Object.values(
                        (sale.lines || []).reduce((acc, l) => {
                          const name = l.materialName;
                          if (!acc[name]) acc[name] = { materialName: name, bagCount: 0, totalKg: 0 };
                          acc[name].bagCount += l.bagCount || 0;
                          acc[name].totalKg += l.totalKg || 0;
                          return acc;
                        }, {})
                      ).map((l) => (
                        <p key={l.materialName} className="text-xs text-primary-500">
                          {l.materialName} · {l.bagCount} bags · {formatKg(l.totalKg)}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <p className="font-semibold text-primary-700">{formatCurrency(sale.totalAmount)}</p>
                    <button
                      type="button"
                      onClick={() => handleViewSaleBill(sale)}
                      className="btn-secondary !py-1.5 !px-2.5 !text-xs"
                    >
                      <FileText className="w-3.5 h-3.5" /> Bill
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card !p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-primary-100 font-semibold text-primary-700">Payments</div>
        {transactions.filter((t) => t.type === 'customer_payment').length === 0 ? (
          <p className="text-center py-10 text-primary-400 text-sm">No payments yet</p>
        ) : (
          <div className="divide-y divide-primary-100">
            {transactions
              .filter((t) => t.type === 'customer_payment')
              .map((tx) => (
                <div key={tx._id} className="px-4 py-3 flex justify-between">
                  <div>
                    <p className="text-sm text-primary-600">{tx.description}</p>
                    <p className="text-xs text-primary-400">{formatDate(tx.createdAt)}</p>
                  </div>
                  <p className="font-semibold text-primary-700">-{formatCurrency(tx.amount)}</p>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
