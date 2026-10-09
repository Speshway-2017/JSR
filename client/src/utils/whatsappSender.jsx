import React from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import toast from 'react-hot-toast';

/**
 * Format phone number into clean digits for WhatsApp (e.g. 919010253076)
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
 * Display 10-digit mobile number for UI toasts / inputs (e.g. 9010253076)
 */
export function formatDisplayPhone(rawPhone) {
  if (!rawPhone) return '';
  const digits = String(rawPhone).replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

let whatsappWebWindowRef = null;

/**
 * Open external URL in system default browser or desktop handler (Electron-compatible).
 * Automatically reuses existing WhatsApp Web tab to avoid opening duplicate tabs.
 */
export function openExternalUrl(url, target = 'JSR_WhatsApp_Web') {
  if (!url) return;
  try {
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
      window.electronAPI.openExternal(url);
      return;
    }
  } catch (err) {
    console.warn('Electron openExternal error:', err);
  }

  try {
    if (target === 'JSR_WhatsApp_Web') {
      if (whatsappWebWindowRef && !whatsappWebWindowRef.closed) {
        whatsappWebWindowRef.location.href = url;
        whatsappWebWindowRef.focus();
        return;
      }
      whatsappWebWindowRef = window.open(url, 'JSR_WhatsApp_Web');
      if (whatsappWebWindowRef) {
        whatsappWebWindowRef.focus();
      }
      return;
    }
  } catch (e) {
    console.warn('[WhatsApp] Tab reuse fallback:', e);
  }

  window.open(url, target);
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
    await new Promise((r) => setTimeout(r, 300));

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
 * Render HTML string into PNG Image Base64 & Blob for clipboard / sharing
 */
export async function renderHtmlToImageBase64(htmlString) {
  if (!htmlString) return { base64: '', blob: null };

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '794px';
  container.style.backgroundColor = '#ffffff';
  container.style.zIndex = '-9999';
  container.innerHTML = htmlString;

  document.body.appendChild(container);

  try {
    await new Promise((r) => setTimeout(r, 300));

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });

    return { base64, blob };
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

/**
 * Render DOM element into PNG Image Base64 & Blob
 */
export async function renderElementToImageBase64(elementNode) {
  if (!elementNode) return { base64: '', blob: null };

  const canvas = await html2canvas(elementNode, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });

  return { base64, blob };
}

/**
 * Copy visual bill image to system clipboard so user can press Ctrl+V in WhatsApp
 */
export async function copyBillImageToClipboard({ htmlString = '', elementNode = null, imageBlob = null, imageBase64 = '' } = {}) {
  try {
    let blob = imageBlob;
    let b64 = imageBase64;

    if (!blob && !b64) {
      if (htmlString) {
        const res = await renderHtmlToImageBase64(htmlString);
        blob = res.blob;
        b64 = res.base64;
      } else if (elementNode) {
        const res = await renderElementToImageBase64(elementNode);
        blob = res.blob;
        b64 = res.base64;
      }
    }

    // 1. In Electron
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.writeClipboardImage === 'function' && b64) {
      await window.electronAPI.writeClipboardImage(b64);
      return true;
    }

    // 2. In modern browser
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof window.ClipboardItem !== 'undefined' && blob) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob,
        }),
      ]);
      return true;
    }
  } catch (err) {
    console.warn('[Clipboard] Failed to copy bill image to clipboard:', err);
  }
  return false;
}

/**
 * Open the Universal Multi-Channel Share Modal (WhatsApp Web, WhatsApp App, Mail, System Share, PDF)
 */
export function openShareModal({
  recipientPhone = '',
  recipientName = 'Customer',
  recipientEmail = '',
  pdfBase64 = '',
  elementNode = null,
  htmlString = '',
  filename = 'JSR_Report.pdf',
  caption = '',
  summaryText = '',
} = {}) {
  const detail = {
    recipientPhone,
    recipientName,
    recipientEmail,
    pdfBase64,
    elementNode,
    htmlString,
    filename,
    caption: caption || summaryText,
    summaryText: summaryText || caption,
  };

  window.dispatchEvent(new CustomEvent('jsr_open_share_modal', { detail }));
  return true;
}

/**
 * Send WhatsApp / Multi-Channel Bill Statement
 * Triggers native system popup notification (WhatsApp Desktop, Teams, Telegram, Mail, PDF)
 * and automatically copies high-res bill image to system clipboard for 1-click Ctrl+V pasting in WhatsApp.
 */
export async function sendWhatsAppBillPdf(options = {}) {
  const {
    recipientPhone = '',
    recipientName = 'Customer',
    recipientEmail = '',
    pdfBase64 = '',
    elementNode = null,
    htmlString = '',
    filename = 'JSR_Report.pdf',
    caption = '',
    summaryText = '',
  } = options;

  const text =
    caption ||
    summaryText ||
    `Dear ${recipientName}, your bill statement from JSR AGRI TRADES is ready. Thank you!`;

  // Render bill image and copy to clipboard in background
  let imgBase64 = '';
  let pdfB64 = pdfBase64;

  try {
    if (htmlString) {
      const [imgRes, pdfRes] = await Promise.all([
        renderHtmlToImageBase64(htmlString).catch(() => ({ base64: '', blob: null })),
        pdfB64 ? Promise.resolve(pdfB64) : renderHtmlToPdfBase64(htmlString).catch(() => ''),
      ]);
      imgBase64 = imgRes.base64;
      pdfB64 = pdfRes || '';
      if (imgRes.blob || imgRes.base64) {
        await copyBillImageToClipboard({ imageBlob: imgRes.blob, imageBase64: imgRes.base64 });
      }
    } else if (elementNode) {
      const [imgRes, pdfRes] = await Promise.all([
        renderElementToImageBase64(elementNode).catch(() => ({ base64: '', blob: null })),
        pdfB64 ? Promise.resolve(pdfB64) : generatePdfBase64FromElement(elementNode).catch(() => ''),
      ]);
      imgBase64 = imgRes.base64;
      pdfB64 = pdfRes || '';
      if (imgRes.blob || imgRes.base64) {
        await copyBillImageToClipboard({ imageBlob: imgRes.blob, imageBase64: imgRes.base64 });
      }
    }
  } catch (err) {
    console.warn('[Share] Pre-rendering bill image error:', err);
  }

  // 1. Electron Native System Dialog (identical to Quit JSR dialog)
  if (
    typeof window !== 'undefined' &&
    window.electronAPI &&
    typeof window.electronAPI.showNativeShareDialog === 'function'
  ) {
    const res = await window.electronAPI.showNativeShareDialog({
      recipientPhone,
      recipientName,
      recipientEmail,
      text,
      fileBase64: pdfB64,
      imageBase64: imgBase64,
      fileName: filename,
    });

    if (res?.success) {
      if (res.app === 'whatsapp_desktop' || res.app === 'whatsapp_web') {
        toast.success('📋 Bill image copied to clipboard! Press Ctrl+V in WhatsApp to attach.', {
          duration: 6000,
        });
      } else if (res.app === 'teams') {
        toast.success('Opening Microsoft Teams (Press Ctrl+V to attach bill image)');
      } else if (res.app === 'telegram') {
        toast.success('Opening Telegram (Press Ctrl+V to attach bill image)');
      } else if (res.app === 'mail') {
        toast.success('Opening Mail client…');
      } else if (res.app === 'save_pdf') {
        toast.success('PDF saved and revealed in folder!');
      }
      return true;
    }
    if (res?.cancelled) {
      return false;
    }
  }

  // 2. Fallback / Browser Environment: Open System Dialog Modal
  return openShareModal({
    ...options,
    pdfBase64: pdfB64,
  });
}
