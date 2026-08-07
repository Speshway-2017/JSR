import User from '../models/User.js';

async function ensureUser({ email, password, name, role }) {
  const normalized = email.toLowerCase().trim();
  let user = await User.findOne({ email: normalized });

  if (user) {
    let dirty = false;
    if (!user.role) {
      user.role = role;
      dirty = true;
    }
    if (dirty) await user.save();
    return { user, created: false };
  }

  user = await User.create({ email: normalized, password, name, role });
  return { user, created: true };
}

/** Ensure default Admin + Sales users exist (create if missing). */
export async function ensureDefaultUsers() {
  // Older DBs may have users without role — treat them as admin
  await User.updateMany(
    { $or: [{ role: { $exists: false } }, { role: null }] },
    { $set: { role: 'admin' } }
  );

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@agritrades.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const salesEmail = process.env.SALES_EMAIL || 'sales@agritrades.com';
  const salesPassword = process.env.SALES_PASSWORD || 'sales123';

  const admin = await ensureUser({
    email: adminEmail,
    password: adminPassword,
    name: 'Admin',
    role: 'admin',
  });
  if (admin.created) {
    console.log(`Admin user created: ${adminEmail} / ${adminPassword}`);
  }

  const sales = await ensureUser({
    email: salesEmail,
    password: salesPassword,
    name: 'Sales',
    role: 'sales',
  });
  if (sales.created) {
    console.log(`Sales user created: ${salesEmail} / ${salesPassword}`);
  }

  return { admin: admin.user, sales: sales.user };
}

/** @deprecated use ensureDefaultUsers */
export async function ensureAdminUser() {
  return ensureDefaultUsers();
}
