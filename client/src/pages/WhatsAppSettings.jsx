import { useEffect, useState } from 'react';
import { MessageSquare, CheckCircle, AlertCircle, Send, Key, Phone, Building, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { sendWhatsAppBillPdf } from '../utils/whatsappSender';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export default function WhatsAppSettings() {
  const isOnline = useOnlineStatus();

  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testPhone, setTestPhone] = useState('9010253076');
  const [sendingTest, setSendingTest] = useState(false);

  const [form, setForm] = useState({
    phoneNumberId: '',
    wabaId: '',
    senderNumber: '',
    accessToken: '',
  });

  const fetchConfig = () => {
    api
      .get('/whatsapp/config')
      .then((res) => {
        setConfig(res.data);
        setForm({
          phoneNumberId: res.data.phoneNumberId || '',
          wabaId: res.data.wabaId || '',
          senderNumber: res.data.senderNumber || '',
          accessToken: '',
        });
      })
      .catch(() => toast.error('Failed to load WhatsApp API status'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const res = await api.post('/whatsapp/config', form);
      toast.success('WhatsApp API credentials saved successfully!');
      setConfig(res.data);
      setForm((prev) => ({ ...prev, accessToken: '' }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save WhatsApp config');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestSend = async () => {
    if (!testPhone || testPhone.length < 10) {
      toast.error('Please enter a valid 10-digit mobile number for testing');
      return;
    }
    setSendingTest(true);
    try {
      const testHtml = `
        <div style="padding: 20px; font-family: sans-serif;">
          <h1 style="color: #047857; margin-bottom: 5px;">JSR TRADERS</h1>
          <p style="color: #4b5563; font-size: 14px;">Meta WhatsApp Integration Verification Test</p>
          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 15px 0;" />
          <p>This is an automated test bill delivered via Meta WhatsApp Cloud API.</p>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 8px; font-weight: bold; color: #166534;">
            Status: API Connected & Active
          </div>
          <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">Timestamp: ${new Date().toLocaleString()}</p>
        </div>
      `;

      await sendWhatsAppBillPdf({
        recipientPhone: testPhone,
        recipientName: 'Test Recipient',
        htmlString: testHtml,
        filename: 'JSR_Test_Document.pdf',
        caption: 'Test message from JSR Traders Meta WhatsApp Cloud API',
      });
    } catch (err) {
      toast.error(err.message || 'Test send failed');
    } finally {
      setSendingTest(false);
    }
  };

  if (loading) {
    return <div className="text-center py-16 text-primary-400">Loading WhatsApp configuration...</div>;
  }

  const isConnected = config?.isConfigured;

  return (
    <div className="space-y-3 max-w-3xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="page-title text-2xl font-bold text-primary-700 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary-600" /> Meta WhatsApp Cloud API Settings
          </h1>
          <p className="text-xs text-primary-500 mt-1">
            Official Meta WhatsApp Cloud API credentials for 1-click PDF bill & report delivery
          </p>
        </div>
      </div>

      {/* Status Card */}
      <div className={`card !p-4 border-l-4 ${isConnected ? 'border-primary-600' : 'border-amber-500'} bg-white space-y-3`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isConnected ? 'bg-primary-100 text-primary-700' : 'bg-amber-100 text-amber-700'}`}>
              {isConnected ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="font-bold text-primary-900 text-sm">
                {isConnected ? 'Meta WhatsApp API Configured' : 'WhatsApp API Credentials Needed'}
              </h2>
              <p className="text-xs text-primary-500 mt-0.5">Sender Number: <span className="font-semibold text-primary-800">{config?.senderNumber || '+91 90102 53076'}</span></p>
            </div>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase border ${isConnected ? 'bg-primary-100 text-primary-800 border-primary-300' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>
            {isConnected ? 'Active' : 'Attention Required'}
          </span>
        </div>

        {/* Current Credentials Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 text-xs border-t border-slate-100">
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-slate-500 font-semibold uppercase text-xs flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-primary-600" /> Phone Number ID
            </span>
            <p className="font-mono font-bold text-slate-800 text-sm">{config?.phoneNumberId || 'Not Set'}</p>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-slate-500 font-semibold uppercase text-xs flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-primary-600" /> WABA Account ID
            </span>
            <p className="font-mono font-bold text-slate-800 text-sm">{config?.wabaId || 'Not Set'}</p>
          </div>

          <div className="sm:col-span-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-slate-500 font-semibold uppercase text-xs flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-primary-600" /> Permanent Access Token
            </span>
            <p className="font-mono text-slate-700 truncate text-xs">{config?.maskedToken || 'Not Set'}</p>
          </div>
        </div>
      </div>

      {/* Edit Configuration Form */}
      <form onSubmit={handleSaveConfig} className="card !p-4 space-y-3">
        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
          <Key className="w-4 h-4 text-primary-600" /> Update API Credentials
        </h3>
        <p className="text-xs text-slate-500">
          Obtain your <strong>Phone Number ID</strong> and <strong>Permanent System User Access Token</strong> from your Meta WhatsApp Developer App dashboard and save them below:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">Phone Number ID *</label>
            <input
              type="text"
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-mono text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
              placeholder="e.g. 105938472819401"
              value={form.phoneNumberId}
              onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">WABA Account ID</label>
            <input
              type="text"
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-mono text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
              placeholder="e.g. 1962348571140826"
              value={form.wabaId}
              onChange={(e) => setForm({ ...form, wabaId: e.target.value })}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">Sender Phone Number</label>
            <input
              type="text"
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-mono text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
              placeholder="e.g. +918977481054"
              value={form.senderNumber}
              onChange={(e) => setForm({ ...form, senderNumber: e.target.value })}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">Access Token (Leave empty to keep current)</label>
            <input
              type="password"
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-mono text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
              placeholder="Paste Meta Permanent Access Token..."
              value={form.accessToken}
              onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={savingConfig}
          className="btn-primary !py-2 !px-4 !text-sm font-semibold flex items-center justify-center gap-2 w-full cursor-pointer shadow-2xs"
        >
          <Save className="w-4 h-4" />
          {savingConfig ? 'Saving Settings...' : 'Save API Credentials'}
        </button>
      </form>

      {/* Test Sending Card */}
      <div className="card !p-4 space-y-2.5">
        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
          <Send className="w-4 h-4 text-primary-600" /> Test WhatsApp Delivery
        </h3>
        <p className="text-xs text-slate-500">
          Enter a mobile number below to verify your WhatsApp Cloud API connection:
        </p>

        <div className="flex items-center gap-2">
          <input
            type="text"
            className="h-9 max-w-xs rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
            placeholder="10-digit mobile number"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
          />
          {isOnline ? (
            <button
              type="button"
              className="btn-primary !py-1.5 !px-3.5 !text-sm flex items-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
              onClick={handleTestSend}
              disabled={sendingTest}
            >
              <Send className="w-4 h-4 text-white" />
              {sendingTest ? 'Sending Test PDF...' : 'Send Test WhatsApp PDF'}
            </button>
          ) : (
            <span className="text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
              Offline (Internet required)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
