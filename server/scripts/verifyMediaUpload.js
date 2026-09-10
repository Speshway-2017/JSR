import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadPdfToMetaMedia } from '../utils/whatsapp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function testMediaUpload() {
  console.log('Testing PDF Media Upload to Meta Cloud API...');
  try {
    const dummyPdfBuffer = Buffer.from('%PDF-1.4 sample pdf content for verification', 'utf-8');
    const mediaId = await uploadPdfToMetaMedia(dummyPdfBuffer, 'test_verification.pdf');
    console.log('✅ PDF Upload SUCCESSFUL! Meta Media ID:', mediaId);
  } catch (err) {
    console.error('❌ PDF Upload FAILED:', err.message);
  }
}

testMediaUpload();
