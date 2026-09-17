import express from 'express';
import { sendWhatsAppDocumentMessage, formatPhoneNumber, getWhatsAppCredentials } from '../utils/whatsapp.js';
import WhatsAppSetting from '../models/WhatsAppSetting.js';
import { auth as protect } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/whatsapp/config
 * Returns current Meta WhatsApp API status & credentials
 */
router.get('/config', protect, async (req, res) => {
  try {
    const creds = await getWhatsAppCredentials();
    const isConfigured = Boolean(creds.phoneNumberId && creds.accessToken);
    const maskedToken = creds.accessToken ? `${creds.accessToken.slice(0, 8)}...${creds.accessToken.slice(-6)}` : '';

    res.json({
      isConfigured,
      phoneNumberId: creds.phoneNumberId,
      wabaId: creds.wabaId,
      senderNumber: creds.senderNumber,
      maskedToken,
      hasToken: Boolean(creds.accessToken),
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to fetch WhatsApp config' });
  }
});

/**
 * POST /api/whatsapp/config
 * Save Meta WhatsApp API settings (Phone Number ID, WABA ID, Access Token, Sender Number)
 */
router.post('/config', protect, async (req, res) => {
  try {
    const { phoneNumberId, wabaId, senderNumber, accessToken } = req.body;

    let config = await WhatsAppSetting.findOne();
    if (!config) {
      config = new WhatsAppSetting({});
    }

    if (phoneNumberId !== undefined) config.phoneNumberId = String(phoneNumberId).trim();
    if (wabaId !== undefined) config.wabaId = String(wabaId).trim();
    if (senderNumber !== undefined) config.senderNumber = String(senderNumber).trim();
    if (accessToken !== undefined && accessToken.trim() && !accessToken.includes('...')) {
      config.accessToken = String(accessToken).trim();
    }

    await config.save();

    if (config.phoneNumberId) process.env.WHATSAPP_PHONE_NUMBER_ID = config.phoneNumberId;
    if (config.wabaId) process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = config.wabaId;
    if (config.senderNumber) process.env.WHATSAPP_SENDER_NUMBER = config.senderNumber;
    if (config.accessToken) process.env.WHATSAPP_ACCESS_TOKEN = config.accessToken;

    const creds = await getWhatsAppCredentials();
    const isConfigured = Boolean(creds.phoneNumberId && creds.accessToken);
    const maskedToken = creds.accessToken ? `${creds.accessToken.slice(0, 8)}...${creds.accessToken.slice(-6)}` : '';

    res.json({
      success: true,
      message: 'WhatsApp configuration saved successfully',
      isConfigured,
      phoneNumberId: creds.phoneNumberId,
      wabaId: creds.wabaId,
      senderNumber: creds.senderNumber,
      maskedToken,
      hasToken: Boolean(creds.accessToken),
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to save WhatsApp config' });
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
      filename = 'JSR_Ledger_Statement.pdf',
      caption = 'Your ledger statement from JSR Traders',
      templateName = 'ledger_statement',
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
