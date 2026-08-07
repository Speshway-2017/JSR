import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, CreditCard, Pencil, X, Save, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import Toggle from '../components/Toggle';
import { STATE_NAMES, getCitiesForState } from '../data/indiaLocations';
import { formatCurrency, formatDate, formatKg } from '../utils/format';
import { openCustomerSaleBillPdf } from '../utils/customerSaleBillPdf';

export default function CustomerDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDesc, setPaymentDesc] = useState('');
  const [paying, setPaying] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    mobile: '',
    state: '',
    city: '',
    address: '',
    handlingCharges: false,
  });

  const fetchData = () => {
    api
      .get(`/customers/${id}`)
      .then((res) => {
        setData(res.data);
        const c = res.data.customer;
        setEditForm({
          name: c.name,
          mobile: c.mobile || '',
          state: c.state,
          city: c.city,
          address: c.address || '',
          handlingCharges: !!c.handlingCharges,
        });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [id]);

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
    const previewTab = window.open('', '_blank');
    try {
      let billSale = sale;
      if (!sale.customer?.name || !sale.lines?.length) {
        const res = await api.get(`/sales/${sale._id}`);
        billSale = res.data;
      } else {
        billSale = { ...sale, customer: data.customer };
      }
      openCustomerSaleBillPdf(billSale, previewTab);
    } catch (err) {
      if (previewTab) previewTab.close();
      toast.error(err.response?.data?.message || 'Failed to generate bill');
    }
  };

  if (loading) return <div className="text-center py-20 text-primary-400">Loading...</div>;
  if (!data) return <div className="text-center py-20 text-primary-400">Customer not found</div>;

  const { customer, sales, transactions } = data;
  const cities = getCitiesForState(editForm.state);

  return (
    <div className="space-y-4">
      <Link to="/customers" className="inline-flex items-center gap-2 text-primary-500 hover:text-primary-700 font-medium text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Customers
      </Link>

      <div className="card">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1">
            {!editing ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <h1 className="page-title">{customer.name}</h1>
                  <button type="button" onClick={() => setEditing(true)} className="btn-secondary !py-2 !px-3 !text-sm">
                    <Pencil className="w-4 h-4" /> Edit
                  </button>
                </div>
                <p className="text-primary-500 mt-2">{customer.city}, {customer.state}</p>
                {customer.mobile && <p className="text-primary-500 text-sm mt-1">{customer.mobile}</p>}
                {customer.address && <p className="text-primary-400 text-sm mt-1">{customer.address}</p>}
                <div className="mt-4 pt-4 border-t border-primary-100">
                  <Toggle
                    checked={!!customer.handlingCharges}
                    onChange={handleToggleHandling}
                    label="Handling Charges Applicable"
                  />
                </div>
              </>
            ) : (
              <form onSubmit={handleSave} className="space-y-3">
                <div className="flex justify-between">
                  <h2 className="font-bold text-primary-700">Edit Customer</h2>
                  <button type="button" onClick={() => setEditing(false)} className="p-1"><X className="w-5 h-5 text-primary-400" /></button>
                </div>
                <input className="input-field" placeholder="Name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
                <input className="input-field" placeholder="Mobile" value={editForm.mobile} onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })} />
                <select className="input-field" value={editForm.state} onChange={(e) => setEditForm({ ...editForm, state: e.target.value, city: '' })} required>
                  {STATE_NAMES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="input-field" value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} required>
                  <option value="">City</option>
                  {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <textarea className="input-field min-h-[64px] resize-none" placeholder="Address" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
                <Toggle checked={editForm.handlingCharges} onChange={(v) => setEditForm({ ...editForm, handlingCharges: v })} label="Handling Charges Applicable" />
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
