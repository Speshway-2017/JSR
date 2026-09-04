import React from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import toast from 'react-hot-toast';
import api from '../api';

/**
 * Format phone number into clean digits for Meta API (e.g. 919010253076)
 */
export function cleanPhone(rawPhone) {
  if (!rawPhone) return '';
  const digits = String(rawPhone).replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length > 10 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
}

/**
 * Display 10-digit mobile number for UI toasts (e.g. 9010253076)
 */
export function formatDisplayPhone(rawPhone) {
  if (!rawPhone) return '';
  const digits = String(rawPhone).replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

/**
 * Capture a DOM element node and generate a PDF base64 string
 */
export async function generatePdfBase64FromElement(element) {
  if (!element) throw new Error('Preview element not found');

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

  pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);

  const dataUri = pdf.output('datauristring');
  return dataUri.split(',')[1];
}

/**
 * Render complete HTML string into a PDF Base64 payload in background
 */
export async function renderHtmlToPdfBase64(htmlString) {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '794px'; // ~A4 width in px
  container.style.backgroundColor = '#ffffff';
  container.style.zIndex = '-9999';
  container.innerHTML = htmlString;

  document.body.appendChild(container);

  try {
    await new Promise((r) => setTimeout(r, 350));

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);

    const dataUri = pdf.output('datauristring');
    return dataUri.split(',')[1];
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

/**
 * Send WhatsApp PDF Bill to customer via 1-Click Meta Cloud API with Web WhatsApp fallback
 */
export async function sendWhatsAppBillPdf({
  recipientPhone,
  recipientName = 'Customer',
  pdfBase64,
  elementNode,
  htmlString,
  filename = 'JSR_Sales_Bill.pdf',
  caption,
  templateName = 'customer_sales_bill',
  templateParams = [],
}) {
  const formattedPhone = cleanPhone(recipientPhone);
  const displayPhone = formatDisplayPhone(recipientPhone);

  if (!formattedPhone || formattedPhone.length < 10) {
    toast.error(`Invalid mobile number for ${recipientName}. Please update phone number in Customer Master.`);
    return false;
  }

  const toastId = toast.loading(`Sending WhatsApp bill PDF to ${recipientName} (${displayPhone})...`);

  try {
    let finalBase64 = pdfBase64;
    if (!finalBase64 && htmlString) {
      finalBase64 = await renderHtmlToPdfBase64(htmlString);
    } else if (!finalBase64 && elementNode) {
      finalBase64 = await generatePdfBase64FromElement(elementNode);
    }

    if (!finalBase64) {
      toast.error('Could not generate PDF bill payload', { id: toastId });
      return false;
    }

    const defaultCaption = `Dear ${recipientName}, your sales bill from JSR Traders is attached. Thank you!`;

    await api.post('/whatsapp/send-pdf', {
      recipientPhone: formattedPhone,
      recipientName,
      pdfBase64: finalBase64,
      filename,
      caption: caption || defaultCaption,
      templateName,
      templateParams: templateParams.length > 0 ? templateParams : [recipientName, new Date().toLocaleDateString('en-IN')],
    });

    toast.success(`WhatsApp PDF sent successfully to ${recipientName} (${displayPhone})!`, { id: toastId, duration: 5000 });
    return true;
  } catch (err) {
    console.error('WhatsApp send error:', err);
    const errMsg = err.response?.data?.message || err.message || 'Failed to send WhatsApp bill';

    const fallbackText = `Dear ${recipientName}, your sales bill from JSR Traders is generated. Thank you!`;
    const waUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(fallbackText)}`;

    // Interactive Toast with direct 1-click Web WhatsApp trigger button
    toast(
      (t) => (
        <div className="flex flex-col gap-2 p-1 max-w-sm">
          <div className="font-bold text-xs text-amber-700">
            Meta API Sandbox Limit: {errMsg.includes('133010') ? 'Number not registered in Meta Sandbox' : errMsg}
          </div>
          <p className="text-[11px] text-slate-600 leading-snug">
            Send bill statement to <strong>{recipientName} ({displayPhone})</strong> via WhatsApp Web / App:
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                window.open(waUrl, '_blank');
                toast.dismiss(t.id);
              }}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow transition flex items-center gap-1.5"
            >
              🚀 Send via WhatsApp Web ({displayPhone})
            </button>
            <button
              type="button"
              onClick={() => toast.dismiss(t.id)}
              className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      ),
      { id: toastId, duration: 20000 }
    );

    return false;
  }
}
