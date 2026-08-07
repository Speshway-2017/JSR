import User from '../models/User.js';

/** Create default admin if no users exist in the database */
export async function ensureAdminUser() {
  const count = await User.countDocuments();
  if (count > 0) return null;

  const email = process.env.ADMIN_EMAIL || 'admin@agritrades.com';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  const user = await User.create({ email, password, name: 'Admin' });
  console.log(`Empty database — admin created: ${email} / ${password}`);
  return user;
}
