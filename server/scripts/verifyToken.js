import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

console.log('Testing Meta WhatsApp Access Token...');
console.log('Phone Number ID:', phoneNumberId);
console.log('Access Token snippet:', accessToken ? accessToken.slice(0, 15) + '...' : 'NONE');

async function testToken() {
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    console.log('Response Status:', res.status);
    console.log('Response Data:', JSON.stringify(data, null, 2));

    if (res.ok && data.id) {
      console.log('✅ Token Verification SUCCESSFUL! Meta WhatsApp API is connected and authorized.');
    } else {
      console.log('❌ Token Verification FAILED:', data.error?.message || JSON.stringify(data));
    }
  } catch (err) {
    console.error('Error during verification:', err.message);
  }
}

testToken();
