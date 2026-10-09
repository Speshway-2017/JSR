import React, { useState, useEffect } from 'react';
import { X, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  cleanPhone,
  formatDisplayPhone,
  renderHtmlToPdfBase64,
  generatePdfBase64FromElement,
  copyBillImageToClipboard,
  openExternalUrl,
} from '../utils/whatsappSender';

export default function ShareReportModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [modalData, setModalData] = useState(null);

  const [phone, setPhone] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [email, setEmail] = useState('');
  const [customText, setCustomText] = useState('');
  const [filename, setFilename] = useState('Report.pdf');
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    const handleOpen = (e) => {
      const data = e.detail || {};
      setModalData(data);
      setRecipientName(data.recipientName || 'Customer');
      setPhone(formatDisplayPhone(data.recipientPhone || ''));
      setEmail(data.recipientEmail || '');
      setFilename(data.filename || `${(data.recipientName || 'Report').replace(/\s+/g, '_')}.pdf`);

      const defaultMsg =
        data.caption ||
        data.summaryText ||
        `Dear ${data.recipientName || 'Customer'}, please find your bill statement from JSR AGRI TRADES. Thank you!`;
      setCustomText(defaultMsg);

      // Pre-copy bill image to clipboard
      if (data.htmlString || data.elementNode) {
        copyBillImageToClipboard({ htmlString: data.htmlString, elementNode: data.elementNode });
      }

      setIsOpen(true);
    };

    window.addEventListener('jsr_open_share_modal', handleOpen);
    return () => {
      window.removeEventListener('jsr_open_share_modal', handleOpen);
    };
  }, []);

  if (!isOpen || !modalData) return null;

  const handleClose = () => {
    setIsOpen(false);
    setModalData(null);
  };

  const getPdfBase64 = async () => {
    if (modalData.pdfBase64) return modalData.pdfBase64;
    setGeneratingPdf(true);
    try {
      let b64 = '';
      if (modalData.htmlString) {
        b64 = await renderHtmlToPdfBase64(modalData.htmlString);
      } else if (modalData.elementNode) {
        b64 = await generatePdfBase64FromElement(modalData.elementNode);
      }
      return b64;
    } finally {
      setGeneratingPdf(false);
    }
  };

  const getPdfFile = async () => {
    const b64 = await getPdfBase64();
    if (!b64) return null;
    const byteCharacters = atob(b64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new File([new Blob([byteArray], { type: 'application/pdf' })], filename, {
      type: 'application/pdf',
    });
  };

  // 1. WhatsApp Desktop
  const handleWhatsAppDesktop = () => {
    const targetDigits = cleanPhone(phone);
    const url = targetDigits
      ? `whatsapp://send?phone=${targetDigits}&text=${encodeURIComponent(customText)}`
      : `whatsapp://send?text=${encodeURIComponent(customText)}`;
    copyBillImageToClipboard({ htmlString: modalData?.htmlString, elementNode: modalData?.elementNode });
    openExternalUrl(url);
    toast.success('📋 Bill image copied! Press Ctrl+V in WhatsApp to attach.', { duration: 6000 });
    handleClose();
  };

  // 2. WhatsApp Web
  const handleWhatsAppWeb = () => {
    const targetDigits = cleanPhone(phone);
    const url = targetDigits
      ? `https://web.whatsapp.com/send?phone=${targetDigits}&text=${encodeURIComponent(customText)}`
      : `https://web.whatsapp.com/send?text=${encodeURIComponent(customText)}`;
    copyBillImageToClipboard({ htmlString: modalData?.htmlString, elementNode: modalData?.elementNode });
    openExternalUrl(url);
    toast.success('📋 Bill image copied! Press Ctrl+V in WhatsApp to attach.', { duration: 6000 });
    handleClose();
  };

  // 3. Microsoft Teams
  const handleTeams = () => {
    const teamsUrl = `https://teams.microsoft.com/share?msgText=${encodeURIComponent(customText)}`;
    copyBillImageToClipboard({ htmlString: modalData?.htmlString, elementNode: modalData?.elementNode });
    openExternalUrl(teamsUrl, '_blank');
    toast.success('Opening Microsoft Teams (Press Ctrl+V to attach bill image)');
    handleClose();
  };

  // 4. Telegram Desktop
  const handleTelegram = () => {
    const tgUrl = `https://t.me/share/url?url=&text=${encodeURIComponent(customText)}`;
    copyBillImageToClipboard({ htmlString: modalData?.htmlString, elementNode: modalData?.elementNode });
    openExternalUrl(tgUrl, '_blank');
    toast.success('Opening Telegram Desktop (Press Ctrl+V to attach bill image)');
    handleClose();
  };

  // 5. Mail / Outlook
  const handleMail = () => {
    const subject = encodeURIComponent(`Statement / Bill - JSR Agri Trades (${recipientName})`);
    const body = encodeURIComponent(customText);
    const mailUrl = email
      ? `mailto:${email}?subject=${subject}&body=${body}`
      : `mailto:?subject=${subject}&body=${body}`;
    openExternalUrl(mailUrl);
    toast.success('Opening Mail client…');
    handleClose();
  };

  // 6. Save PDF
  const handleSavePdf = async () => {
    try {
      const file = await getPdfFile();
      if (!file) {
        toast.error('Could not generate PDF');
        return;
      }
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Saved ${filename}`);
      handleClose();
    } catch (err) {
      toast.error(err.message || 'Failed to save PDF');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[1px] animate-fadeIn">
      {/* Native Windows Dialog Box Container */}
      <div className="bg-[#F0F0F0] text-[#1E1E1E] w-full max-w-[460px] rounded-lg shadow-2xl border border-[#B0B0B0] flex flex-col overflow-hidden font-sans select-none animate-scaleIn">
        {/* Title Bar */}
        <div className="px-4 py-2 bg-[#3A3E42] text-white flex items-center justify-between shrink-0">
          <span className="text-xs font-semibold tracking-wide">Share Statement</span>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded hover:bg-[#505458] text-gray-300 hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Dialog Body */}
        <div className="p-5 flex items-start gap-4">
          {/* Blue Windows Info Icon */}
          <div className="w-10 h-10 rounded-full bg-[#0078D4] text-white flex items-center justify-center shrink-0 shadow-xs">
            <span className="font-serif font-bold text-xl leading-none italic select-none">i</span>
          </div>

          {/* Dialog Message */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-[#191919] mb-1">
              Share statement for {recipientName}?
            </h3>
            <p className="text-xs text-[#555] leading-relaxed">
              Recipient: <span className="font-semibold text-[#222]">{recipientName}</span>
              {phone ? ` (${phone})` : ''}
              <br />
              Select which desktop application you want to share with:
            </p>
          </div>
        </div>

        {/* Windows Dialog Buttons Grid */}
        <div className="px-5 pb-5 pt-1 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {/* WhatsApp Desktop */}
          <button
            type="button"
            onClick={handleWhatsAppDesktop}
            className="px-3 py-2 bg-[#E1E1E1] hover:bg-[#D5D5D5] active:bg-[#CCCCCC] text-[#1E1E1E] border border-[#ADADAD] rounded text-xs font-semibold transition-colors cursor-pointer text-center truncate shadow-2xs"
          >
            WhatsApp Desktop
          </button>

          {/* WhatsApp Web */}
          <button
            type="button"
            onClick={handleWhatsAppWeb}
            className="px-3 py-2 bg-[#E1E1E1] hover:bg-[#D5D5D5] active:bg-[#CCCCCC] text-[#1E1E1E] border border-[#ADADAD] rounded text-xs font-semibold transition-colors cursor-pointer text-center truncate shadow-2xs"
          >
            WhatsApp Web
          </button>

          {/* Microsoft Teams */}
          <button
            type="button"
            onClick={handleTeams}
            className="px-3 py-2 bg-[#E1E1E1] hover:bg-[#D5D5D5] active:bg-[#CCCCCC] text-[#1E1E1E] border border-[#ADADAD] rounded text-xs font-semibold transition-colors cursor-pointer text-center truncate shadow-2xs"
          >
            Microsoft Teams
          </button>

          {/* Telegram Desktop */}
          <button
            type="button"
            onClick={handleTelegram}
            className="px-3 py-2 bg-[#E1E1E1] hover:bg-[#D5D5D5] active:bg-[#CCCCCC] text-[#1E1E1E] border border-[#ADADAD] rounded text-xs font-semibold transition-colors cursor-pointer text-center truncate shadow-2xs"
          >
            Telegram Desktop
          </button>

          {/* Mail / Outlook */}
          <button
            type="button"
            onClick={handleMail}
            className="px-3 py-2 bg-[#E1E1E1] hover:bg-[#D5D5D5] active:bg-[#CCCCCC] text-[#1E1E1E] border border-[#ADADAD] rounded text-xs font-semibold transition-colors cursor-pointer text-center truncate shadow-2xs"
          >
            Mail / Outlook
          </button>

          {/* Save PDF */}
          <button
            type="button"
            disabled={generatingPdf}
            onClick={handleSavePdf}
            className="px-3 py-2 bg-[#E1E1E1] hover:bg-[#D5D5D5] active:bg-[#CCCCCC] text-[#1E1E1E] border border-[#ADADAD] rounded text-xs font-semibold transition-colors cursor-pointer text-center truncate shadow-2xs disabled:opacity-50"
          >
            {generatingPdf ? 'Generating…' : 'Save PDF'}
          </button>
        </div>

        {/* Dialog Footer Cancel Button */}
        <div className="px-5 py-2.5 bg-[#E6E6E6] border-t border-[#D0D0D0] flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="px-5 py-1.5 bg-[#FFFFFF] hover:bg-[#F2F2F2] active:bg-[#E0E0E0] text-[#1E1E1E] border border-[#ADADAD] rounded text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
