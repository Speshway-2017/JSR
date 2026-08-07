import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import { ensureAdminUser } from '../utils/ensureAdmin.js';
import User from '../models/User.js';

dotenv.config();

const seed = async () => {
  await connectDB();

  const email = process.env.ADMIN_EMAIL || 'admin@agritrades.com';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  const created = await ensureAdminUser();
  if (!created) {
    const existing = await User.findOne({ email });
    console.log('Admin user already exists:', existing?.email || email);
  }

  console.log('Seed complete. Login with:', email, '/', password);
  process.exit(0);
};

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
