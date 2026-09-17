import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

/**
 * Format raw phone number into standard international format without leading + or symbols.
 * Example: "9010253076" -> "919010253076", "+91 89774-81054" -> "918977481054"
 */
export function formatPhoneNumber(rawPhone) {
  if (!rawPhone) return '';
  const cleaned = String(rawPhone).replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `91${cleaned}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return cleaned;
  }
  if (cleaned.length > 10 && cleaned.startsWith('0')) {
    return `91${cleaned.slice(1)}`;
  }
  return cleaned;
}

/**
 * Upload PDF Buffer to Meta WhatsApp Media Endpoint
 */
export async function uploadPdfToMetaMedia(pdfBuffer, filename = 'document.pdf', customCreds = {}) {
  const phoneNumberId = customCreds.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = customCreds.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error('Meta WhatsApp Cloud API credentials missing (Phone Number ID or Access Token)');
  }

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/media`;

  const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
  const formData = new FormData();
  formData.append('messaging_product', 'whatsapp');
  formData.append('file', blob, filename);
  formData.append('type', 'application/pdf');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  const data = await response.json();
  if (!response.ok || !data.id) {
    let errorMsg = data.error?.message || data.error?.error_user_msg || JSON.stringify(data);
    if (data.error?.code === 190 || errorMsg.includes('Authentication Error') || errorMsg.includes('OAuth')) {
      errorMsg = 'Meta Access Token in server/.env is expired or invalid (Authentication Error). Please generate a new System User Access Token from Meta Developer Console.';
    }
    throw new Error(`Meta Media Upload Failed: ${errorMsg}`);
  }

  return data.id; // Returns Meta Media ID
}

/**
 * Send WhatsApp Document Message or Template Document Message via Meta Cloud API
 */
export async function sendWhatsAppDocumentMessage({
  to,
  pdfBuffer,
  filename = 'Bill.pdf',
  caption = 'Your bill from JSR Traders',
  templateName = 'ledger_statement',
  templateParams = [],
  customCreds = {},
}) {
  const phoneNumberId = customCreds.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = customCreds.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error('Meta WhatsApp Cloud API credentials missing (Phone Number ID or Access Token)');
  }

  const formattedPhone = formatPhoneNumber(to);
  if (!formattedPhone || formattedPhone.length < 10) {
    throw new Error(`Invalid recipient phone number: "${to}"`);
  }

  // Step 1: Upload PDF to Meta Media API
  const mediaId = await uploadPdfToMetaMedia(pdfBuffer, filename, customCreds);
  const messagesUrl = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

  // Step 2: Try Approved Template Message (Required for Business Initiated Conversations)
  if (templateName) {
    const tryLanguages = ['en_US', 'en'];
    for (const langCode of tryLanguages) {
      const templatePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: langCode },
          components: [
            {
              type: 'header',
              parameters: [
                {
                  type: 'document',
                  document: {
                    id: mediaId,
                    filename: filename,
                  },
                },
              ],
            },
          ],
        },
      };

      if (templateParams && templateParams.length > 0) {
        templatePayload.template.components.push({
          type: 'body',
          parameters: templateParams.map((val) => ({ type: 'text', text: String(val) })),
        });
      }

      const res = await fetch(messagesUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(templatePayload),
      });

      const resData = await res.json();
      if (res.ok && resData.messages?.[0]?.id) {
        return {
          success: true,
          messageId: resData.messages[0].id,
          recipient: formattedPhone,
          mediaId,
        };
      }
    }
  }

  // Step 3: Fallback to Direct Document Message (Within 24-hr active user window)
  const directPayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: formattedPhone,
    type: 'document',
    document: {
      id: mediaId,
      caption: caption,
      filename: filename,
    },
  };

  const response = await fetch(messagesUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(directPayload),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    let errDetails = data.error?.message || data.error?.error_user_msg || JSON.stringify(data);
    if (data.error?.code === 190 || errDetails.includes('Authentication Error') || errDetails.includes('OAuth')) {
      errDetails = 'Meta Access Token in server/.env is expired or invalid. Please generate a new System User Access Token from Meta Developer Console.';
    }
    throw new Error(`Meta WhatsApp Message Failed: ${errDetails}`);
  }

  return {
    success: true,
    messageId: data.messages?.[0]?.id,
    recipient: formattedPhone,
    mediaId,
  };
}
