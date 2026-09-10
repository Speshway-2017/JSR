import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

async function fetchWabaNumbers() {
  console.log('Fetching all Phone Numbers for WABA ID:', wabaId);
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${wabaId}/phone_numbers`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    console.log('API Response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error fetching numbers:', err.message);
  }
}

fetchWabaNumbers();
