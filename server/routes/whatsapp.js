import express from 'express';
import { sendWhatsAppDocumentMessage, formatPhoneNumber } from '../utils/whatsapp.js';
import { auth as protect } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/whatsapp/config
 * Returns current Meta WhatsApp API status (masked token)
 */
router.get('/config', protect, async (req, res) => {
  try {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '';
    const senderNumber = process.env.WHATSAPP_SENDER_NUMBER || '';
    const token = process.env.WHATSAPP_ACCESS_TOKEN || '';

    const isConfigured = Boolean(phoneNumberId && token);
    const maskedToken = token ? `${token.slice(0, 8)}...${token.slice(-6)}` : '';

    res.json({
      isConfigured,
      phoneNumberId,
      wabaId,
      senderNumber,
      maskedToken,
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch WhatsApp config' });
  }
});

/**
 * POST /api/whatsapp/send-pdf
 * Send PDF bill via Meta WhatsApp Cloud API directly to customer's phone number
 */
router.post('/send-pdf', protect, async (req, res) => {
  try {
    const {
      recipientPhone,
      recipientName,
      pdfBase64,
      filename = 'JSR_Sales_Bill.pdf',
      caption = 'Your sales bill from JSR Traders',
      templateName = 'customer_sales_bill',
      templateParams = [],
    } = req.body;

    if (!recipientPhone) {
      return res.status(400).json({ message: 'Recipient phone number is required' });
    }

    if (!pdfBase64) {
      return res.status(400).json({ message: 'PDF document payload (base64) is required' });
    }

    // Convert Base64 (with or without data URI prefix) to Buffer
    const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
    const pdfBuffer = Buffer.from(cleanBase64, 'base64');

    if (!pdfBuffer || pdfBuffer.length === 0) {
      return res.status(400).json({ message: 'Invalid PDF base64 data' });
    }

    const result = await sendWhatsAppDocumentMessage({
      to: recipientPhone,
      pdfBuffer,
      filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
      caption: caption || `Bill for ${recipientName || 'Customer'} from JSR Traders`,
      templateName,
      templateParams: templateParams.length > 0 ? templateParams : [recipientName || 'Customer', new Date().toLocaleDateString('en-IN')],
    });

    res.json({
      success: true,
      message: `WhatsApp PDF successfully sent to ${result.recipient}`,
      messageId: result.messageId,
      recipient: result.recipient,
    });
  } catch (err) {
    console.error('[WhatsApp Send Error]:', err.message);
    res.status(400).json({
      success: false,
      message: err.message || 'Failed to send WhatsApp document',
    });
  }
});

export default router;
