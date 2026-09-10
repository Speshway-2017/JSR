import { useEffect, useState } from 'react';
import { MessageSquare, CheckCircle, AlertCircle, Send, Key, Phone, Building } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { sendWhatsAppBillPdf } from '../utils/whatsappSender';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export default function WhatsAppSettings() {
  const isOnline = useOnlineStatus();

  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testPhone, setTestPhone] = useState('9010253076');
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    api
      .get('/whatsapp/config')
      .then((res) => setConfig(res.data))
      .catch(() => toast.error('Failed to load WhatsApp API status'))
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <MessageSquare className="w-7 h-7 text-emerald-600" /> Meta WhatsApp Cloud API Settings
        </h1>
        <p className="text-primary-400 text-sm mt-0.5">
          Official Meta WhatsApp Cloud API credentials for 1-click PDF bill & report delivery
        </p>
      </div>

      {/* Status Card */}
      <div className="card !p-5 border-l-4 border-emerald-500 bg-white space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-100 text-emerald-700 rounded-2xl">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-base">Meta WhatsApp API Connected</h2>
              <p className="text-xs text-slate-500">Sender Number: {config?.senderNumber || '+91 89774 81054'}</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold uppercase border border-emerald-300">
            Active
          </span>
        </div>

        {/* Credentials Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs border-t border-slate-100">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <span className="text-slate-400 font-semibold uppercase text-[10px] flex items-center gap-1">
              <Phone className="w-3 h-3 text-emerald-600" /> Phone Number ID
            </span>
            <p className="font-mono font-bold text-slate-800">{config?.phoneNumberId || '1318838441307212'}</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <span className="text-slate-400 font-semibold uppercase text-[10px] flex items-center gap-1">
              <Building className="w-3 h-3 text-emerald-600" /> WABA Account ID
            </span>
            <p className="font-mono font-bold text-slate-800">{config?.wabaId || '1962348571140826'}</p>
          </div>

          <div className="sm:col-span-2 p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <span className="text-slate-400 font-semibold uppercase text-[10px] flex items-center gap-1">
              <Key className="w-3 h-3 text-emerald-600" /> Permanent Access Token
            </span>
            <p className="font-mono text-slate-700 truncate">{config?.maskedToken || 'EAAPJuO8eoZAoBSTyZAe19oYRbaYLWcC7HX5...'}</p>
          </div>
        </div>
      </div>

      {/* Test Sending Card */}
      <div className="card !p-5 space-y-4">
        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
          <Send className="w-4 h-4 text-emerald-600" /> Test WhatsApp Delivery
        </h3>
        <p className="text-xs text-slate-500">
          Enter a phone number below to send a sample test PDF bill directly to WhatsApp:
        </p>

        <div className="flex items-center gap-3">
          <input
            type="text"
            className="input-field max-w-xs text-sm"
            placeholder="10-digit mobile number (e.g. 9010253076)"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
          />
          {isOnline ? (
            <button
              type="button"
              className="btn-primary !py-2.5 !px-4 text-xs flex items-center gap-2"
              onClick={handleTestSend}
              disabled={sendingTest}
            >
              <Send className="w-4 h-4 text-white" />
              {sendingTest ? 'Sending Test PDF...' : 'Send Test WhatsApp PDF'}
            </button>
          ) : (
            <span className="text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
              Offline (Internet connection required to send test WhatsApp messages)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
