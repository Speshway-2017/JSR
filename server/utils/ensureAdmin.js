import User from '../models/User.js';
import SalesMaterial from '../models/SalesMaterial.js';
import SalesBagReport from '../models/SalesBagReport.js';

const LEGACY_ADMIN_EMAIL = 'admin@agritrades.com';
const LEGACY_SALES_EMAIL = 'sales@agritrades.com';

async function migrateEmail(fromEmail, toEmail) {
  const from = fromEmail.toLowerCase().trim();
  const to = toEmail.toLowerCase().trim();
  if (from === to) return null;

  const already = await User.findOne({ email: to });
  if (already) return already;

  const legacy = await User.findOne({ email: from });
  if (!legacy) return null;

  legacy.email = to;
  await legacy.save();
  console.log(`Migrated login email ${from} → ${to}`);
  return legacy;
}

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

/** Seed sales materials from past bag-order entries if catalog is empty. */
async function seedSalesMaterialsFromReports() {
  const count = await SalesMaterial.countDocuments();
  if (count > 0) return;

  const reports = await SalesBagReport.find().select('entries.materialName').lean();
  const names = new Set();
  for (const report of reports) {
    for (const e of report.entries || []) {
      const n = String(e.materialName || '').trim();
      if (n) names.add(n);
    }
  }
  if (names.size === 0) return;

  try {
    await SalesMaterial.insertMany(
      Array.from(names).map((name) => ({ name })),
      { ordered: false }
    );
    console.log(`Seeded ${names.size} sales material(s) from previous reports`);
  } catch {
    // ignore duplicate race
  }
}

/** Ensure default Admin + Sales users exist (create if missing). */
export async function ensureDefaultUsers() {
  // Older DBs may have users without role — treat them as admin
  await User.updateMany(
    { $or: [{ role: { $exists: false } }, { role: null }] },
    { $set: { role: 'admin' } }
  );

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@jsr.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const salesEmail = process.env.SALES_EMAIL || 'sales@jsr.com';
  const salesPassword = process.env.SALES_PASSWORD || 'sales123';

  // Move legacy agritrades.com accounts to jsr.com when present
  await migrateEmail(LEGACY_ADMIN_EMAIL, adminEmail);
  await migrateEmail(LEGACY_SALES_EMAIL, salesEmail);

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

  await seedSalesMaterialsFromReports();

  return { admin: admin.user, sales: sales.user };
}

/** @deprecated use ensureDefaultUsers */
export async function ensureAdminUser() {
  return ensureDefaultUsers();
}
