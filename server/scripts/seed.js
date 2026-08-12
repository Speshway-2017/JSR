import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import { ensureDefaultUsers } from '../utils/ensureAdmin.js';

dotenv.config();

const seed = async () => {
  await connectDB();
  await ensureDefaultUsers();

  console.log('Seed complete.');
  console.log('Admin:', process.env.ADMIN_EMAIL || 'admin@jsr.com', '/', process.env.ADMIN_PASSWORD || 'admin123');
  console.log('Sales:', process.env.SALES_EMAIL || 'sales@jsr.com', '/', process.env.SALES_PASSWORD || 'sales123');
  process.exit(0);
};

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
