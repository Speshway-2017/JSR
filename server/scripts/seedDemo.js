/**
 * Bulk demo history for the local session DB (2 years of market activity).
 * Usage: MONGODB_URI=mongodb://127.0.0.1:27018/agriTrades node scripts/seedDemo.js
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from '../config/db.js';
import { ensureDefaultUsers } from '../utils/ensureAdmin.js';
import Schedule from '../models/Schedule.js';
import Material from '../models/Material.js';
import Vendor from '../models/Vendor.js';
import Customer from '../models/Customer.js';
import Load from '../models/Load.js';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import Transaction from '../models/Transaction.js';
import PriceSettings from '../models/PriceSettings.js';
import CompanySettings from '../models/CompanySettings.js';
import SalesMaterial from '../models/SalesMaterial.js';
import SalesBagReport from '../models/SalesBagReport.js';
import User from '../models/User.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27018/agriTrades';
}

const END = new Date(2026, 7, 20, 18, 0, 0, 0);
const START = new Date(2024, 7, 20, 8, 0, 0, 0);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260820);

function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function irand(min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}

function round1(n) {
  return Number(n.toFixed(1));
}

function round2(n) {
  return Number(n.toFixed(2));
}

function atDay(day, hour, minute = 0) {
  const d = new Date(day);
  d.setHours(hour, minute, irand(0, 59), irand(0, 999));
  return d;
}

const MATERIAL_DEFS = [
  { name: 'Mirchi', nameTelugu: 'మిర్చి', sellingPricePerKg: 12 },
  { name: 'Tomato', nameTelugu: 'టమాట', sellingPricePerKg: 10 },
  { name: 'CAB', nameTelugu: 'క్యాబేజీ', sellingPricePerKg: 14 },
  { name: 'VVR Crate', nameTelugu: 'వీవీఆర్ క్రేట్', sellingPricePerKg: 11 },
  { name: 'LTC BT BF', nameTelugu: 'ఎల్టీసీ', sellingPricePerKg: 13 },
  { name: 'Bajji Box', nameTelugu: 'బజ్జీ బాక్స్', sellingPricePerKg: 25 },
  { name: 'CAPS Box', nameTelugu: 'క్యాప్స్ బాక్స్', sellingPricePerKg: 35 },
  { name: 'Onion', nameTelugu: 'ఉల్లి', sellingPricePerKg: 18 },
  { name: 'Potato', nameTelugu: 'బంగాళాదుంప', sellingPricePerKg: 16 },
  { name: 'Brinjal', nameTelugu: 'వంకాయ', sellingPricePerKg: 15 },
  { name: 'Ladies Finger', nameTelugu: 'బెండకాయ', sellingPricePerKg: 20 },
  { name: 'Ridge Gourd', nameTelugu: 'బీరకాయ', sellingPricePerKg: 17 },
  { name: 'Bottle Gourd', nameTelugu: 'సొరకాయ', sellingPricePerKg: 12 },
  { name: 'Beans', nameTelugu: 'చిక్కుడు', sellingPricePerKg: 22 },
];

const SCHEDULE_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const VENDOR_DEFS = [
  { name: 'Dilip', nameTelugu: 'దిలీప్', city: 'Hyderabad', address: 'Bowenpally yard' },
  { name: 'Ranga', nameTelugu: 'రంగా', city: 'Guntur', address: 'Rythu Bazar' },
  { name: 'Naresh Farms', nameTelugu: 'నరేష్ ఫార్మ్స్', city: 'Kurnool', address: 'Collectorate road' },
  { name: 'Srinivas', nameTelugu: 'శ్రీనివాస్', city: 'Warangal', address: 'Market yard' },
  { name: 'Venkat Reddy', nameTelugu: 'వెంకట్ రెడ్డి', city: 'Nizamabad', address: 'APMC' },
  { name: 'Lakshmi Traders', nameTelugu: 'లక్ష్మీ ట్రేడర్స్', city: 'Vijayawada', address: 'Krishna lanka' },
  { name: 'Anil Kumar', nameTelugu: 'అనిల్ కుమార్', city: 'Karimnagar', address: 'Bus stand road' },
  { name: 'Prabhakar', nameTelugu: 'ప్రభాకర్', city: 'Ongole', address: 'Addanki road' },
  { name: 'Yadagiri', nameTelugu: 'యాదగిరి', city: 'Mahabubnagar', address: 'Old town' },
  { name: 'Chandraiah', nameTelugu: 'చంద్రయ్య', city: 'Nalgonda', address: 'Miryalaguda road' },
  { name: 'Satyam', nameTelugu: 'సత్యం', city: 'Srikakulam', address: 'Junction' },
  { name: 'Ravi Produce', nameTelugu: 'రవి ప్రొడ్యూస్', city: 'Tirupati', address: 'Renigunta' },
  { name: 'Bhaskar', nameTelugu: 'భాస్కర్', city: 'Kadapa', address: 'Railway colony' },
  { name: 'Murali Krishna', nameTelugu: 'మురళీ కృష్ణ', city: 'Eluru', address: 'Powerpet' },
  { name: 'Jagan', nameTelugu: 'జగన్', city: 'Vizianagaram', address: 'Three lamps' },
  { name: 'Suresh Naidu', nameTelugu: 'సురేష్ నాయుడు', city: 'Nellore', address: 'AC Nagar' },
  { name: 'Hari Babu', nameTelugu: 'హరి బాబు', city: 'Anantapur', address: 'Clock tower' },
  { name: 'Prasad Goud', nameTelugu: 'ప్రసాద్ గౌడ్', city: 'Medak', address: 'Siddipet road' },
];

const CUSTOMER_DEFS = [
  ['Ramarao', 'రామారావు'],
  ['Malli', 'మల్లి'],
  ['Manoj', 'మనోజ్'],
  ['Charab', 'చరబ్'],
  ['BPN', 'బిపిఎన్'],
  ['RUR', 'ఆర్‌యుఆర్'],
  ['VSM', 'విఎస్ఎం'],
  ['JPR', 'జెపిఆర్'],
  ['VKD', 'వికెడి'],
  ['LNS', 'ఎల్ఎన్ఎస్'],
  ['JK', 'జెకె'],
  ['AKS', 'ఎకెఎస్'],
  ['SPR', 'ఎస్పిఆర్'],
  ['PSR', 'పిఎస్ఆర్'],
  ['VLR', 'విఎల్ఆర్'],
  ['VANNI', 'వన్ని'],
  ['ANM', 'ఎఎన్ఎం'],
  ['BSN', 'బిఎస్ఎన్'],
  ['WR', 'డబ్ల్యుఆర్'],
  ['JSR', 'జెఎస్ఆర్'],
  ['VVR', 'వీవీఆర్'],
  ['Nagu', 'నాగు'],
  ['Uma', 'ఉమ'],
  ['Appa Rao', 'అప్పారావు'],
  ['Kiran', 'కిరణ్'],
  ['Sai', 'సాయి'],
  ['Ramesh', 'రమేష్'],
  ['Srinivasulu', 'శ్రీనివాసులు'],
  ['Pavan', 'పవన్'],
  ['Teja', 'తేజ'],
  ['Gopi', 'గోపి'],
  ['Naidu', 'నాయుడు'],
  ['Babu Rao', 'బాబూరావు'],
  ['Chanti', 'చంటి'],
  ['Raju', 'రాజు'],
  ['Sekhar', 'శేఖర్'],
  ['Madhu', 'మధు'],
  ['Krishna', 'కృష్ణ'],
  ['Venky', 'వెంకీ'],
  ['Suresh', 'సురేష్'],
  ['Prakash', 'ప్రకాష్'],
  ['Anand', 'ఆనంద్'],
  ['Narasimha', 'నరసింహ'],
  ['Yadav', 'యాదవ్'],
  ['Goud', 'గౌడ్'],
  ['Reddy', 'రెడ్డి'],
  ['Shankar', 'శంకర్'],
  ['Mohan', 'మోహన్'],
  ['Prasad', 'ప్రసాద్'],
  ['Kumar', 'కుమార్'],
  ['Raja', 'రాజా'],
  ['Chandra', 'చంద్ర'],
  ['Naveen', 'నవీన్'],
  ['Ajay', 'అజయ్'],
  ['Vamsi', 'వంశీ'],
  ['Karthik', 'కార్తీక్'],
  ['Sandeep', 'సందీప్'],
  ['Mahesh', 'మహేష్'],
  ['Sunil', 'సునీల్'],
  ['Ashok', 'అశోక్'],
  ['Ganesh', 'గణేష్'],
  ['Durga Rao', 'దుర్గారావు'],
  ['Laxman', 'లక్ష్మణ్'],
  ['Subba Rao', 'సుబ్బారావు'],
  ['Pedda Reddy', 'పెద్ద రెడ్డి'],
  ['Chinna', 'చిన్న'],
  ['Balaiah', 'బాలయ్య'],
  ['Yellaiah', 'యెల్లయ్య'],
  ['Komuraiah', 'కోమురయ్య'],
  ['Posani', 'పోసాని'],
  ['Thirupathi', 'తిరుపతి'],
  ['Mallesh', 'మల్లేష్'],
  ['Narsinga Rao', 'నర్సింగరావు'],
  ['Padma', 'పద్మ'],
  ['Lakshmi', 'లక్ష్మి'],
  ['Swathi', 'స్వాతి'],
  ['Kavitha', 'కవిత'],
  ['Sita', 'సీత'],
  ['Radha', 'రాధ'],
  ['Anitha', 'అనిత'],
];

const CITIES = ['Hyderabad', 'Guntur', 'Warangal', 'Kurnool', 'Nizamabad', 'Karimnagar', 'Ongole'];

function seasonalRate(material, day) {
  const month = day.getMonth();
  const base = material.sellingPricePerKg || 12;
  const wave = Math.sin((month / 12) * Math.PI * 2) * 4;
  const jitter = irand(-2, 3);
  const boxBoost = /box/i.test(material.name) ? irand(0, 8) : 0;
  return Math.max(6, Math.round(base + wave + jitter + boxBoost));
}

function bagWeights(count, materialName) {
  const boxy = /box|crate/i.test(materialName);
  const weights = [];
  for (let i = 0; i < count; i += 1) {
    if (boxy) weights.push(round1(irand(20, 38) + rand()));
    else weights.push(round1(irand(48, 78) + rand() * 0.4));
  }
  return weights;
}

async function upsertByName(Model, docs, extra = () => ({})) {
  const out = [];
  for (const doc of docs) {
    const existing = await Model.findOne({ name: doc.name });
    if (existing) {
      let dirty = false;
      if (doc.nameTelugu && !existing.nameTelugu) {
        existing.nameTelugu = doc.nameTelugu;
        dirty = true;
      }
      if (dirty) await existing.save();
      out.push(existing);
    } else {
      out.push(await Model.create({ ...doc, ...extra(doc) }));
    }
  }
  return out;
}

async function insertChunks(Model, docs, size = 800) {
  let n = 0;
  for (let i = 0; i < docs.length; i += size) {
    const chunk = docs.slice(i, i + size);
    if (!chunk.length) continue;
    await Model.insertMany(chunk, { ordered: false });
    n += chunk.length;
  }
  return n;
}

const seed = async () => {
  await connectDB();
  await ensureDefaultUsers();

  const priorHistory = await Sale.countDocuments({ createdAt: { $lt: new Date(2025, 0, 1) } });
  if (priorHistory > 50 && process.argv[2] !== '--force') {
    console.log(`Demo history already present (${priorHistory} sales before 2025). Pass --force to add more.`);
    process.exit(0);
  }

  const schedules = await upsertByName(
    Schedule,
    SCHEDULE_NAMES.map((name) => ({ name }))
  );

  const materials = await upsertByName(Material, MATERIAL_DEFS);
  await upsertByName(
    SalesMaterial,
    MATERIAL_DEFS.map((m) => ({ name: m.name }))
  );

  let v = 0;
  const vendors = await upsertByName(Vendor, VENDOR_DEFS, () => {
    v += 1;
    return { mobile: `98480${String(10000 + v).slice(-5)}` };
  });

  let c = 0;
  const customers = await upsertByName(
    Customer,
    CUSTOMER_DEFS.map(([name, nameTelugu]) => ({
      name,
      nameTelugu,
      address: pick(CITIES),
      handlingCharges: rand() < 0.38,
    })),
    () => {
      c += 1;
      return {
        mobile: `90000${String(10000 + c).slice(-5)}`,
        schedule: pick(schedules)._id,
      };
    }
  );

  if (!(await PriceSettings.findOne())) {
    await PriceSettings.create({
      kirayi: 2,
      riksha: 1,
      cooly: 10,
      aaseelu: 1,
      commission: 5,
      vadakam: 1,
      rusumu: 1,
      union: 1,
    });
  }

  let company = await CompanySettings.findOne();
  if (!company) company = await CompanySettings.create({});
  if (!company.openingSet) {
    company.openingBalance = 125000;
    company.openingDate = START;
    company.openingSet = true;
    await company.save();
  }

  const salesUser = await User.findOne({ role: 'sales' });

  const custBal = new Map(customers.map((x) => [String(x._id), Number(x.creditBalance) || 0]));
  const vendBal = new Map(vendors.map((x) => [String(x._id), Number(x.creditBalance) || 0]));

  const salesBuf = [];
  const loadBuf = [];
  const purchaseBuf = [];
  const txBuf = [];
  const reportBuf = [];

  const flush = async () => {
    await insertChunks(Load, loadBuf);
    await insertChunks(Sale, salesBuf);
    await insertChunks(Purchase, purchaseBuf);
    await insertChunks(Transaction, txBuf);
    loadBuf.length = 0;
    salesBuf.length = 0;
    purchaseBuf.length = 0;
    txBuf.length = 0;
  };

  const bump = (map, id, delta) => {
    const key = String(id);
    map.set(key, round2((map.get(key) || 0) + delta));
    return map.get(key);
  };

  let dayCount = 0;
  const cursor = new Date(START);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= END) {
    const sunday = cursor.getDay() === 0;
    if (sunday && rand() > 0.12) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }

    dayCount += 1;
    const vendorsToday = [...vendors].sort(() => rand() - 0.5).slice(0, irand(3, 6));
    const loadByVendor = new Map();

    for (const vendor of vendorsToday) {
      const loadId = new mongoose.Types.ObjectId();
      const when = atDay(cursor, 6, irand(10, 50));
      loadBuf.push({
        _id: loadId,
        vendor: vendor._id,
        loadDate: new Date(cursor),
        materials: [],
        totalWeight: 0,
        handlingCharges: 0,
        notes: 'demo_seed',
        createdAt: when,
        updatedAt: when,
      });
      loadByVendor.set(String(vendor._id), { loadId, vendor, soldKg: 0, soldAmt: 0, bags: 0 });
    }

    const saleCount = sunday ? irand(8, 16) : irand(24, 48);
    const dayCustomers = new Set();

    for (let i = 0; i < saleCount; i += 1) {
      const slot = loadByVendor.get(String(pick(vendorsToday)._id));
      const customer = pick(customers);
      dayCustomers.add(customer);
      const nLines = rand() < 0.22 ? 2 : 1;
      const usedMats = new Set();
      const lines = [];
      let materialsTotal = 0;
      let totalBags = 0;
      let totalWeight = 0;

      for (let L = 0; L < nLines; L += 1) {
        let material = pick(materials);
        let guard = 0;
        while (usedMats.has(String(material._id)) && guard < 8) {
          material = pick(materials);
          guard += 1;
        }
        usedMats.add(String(material._id));
        const bags = bagWeights(irand(2, 8), material.name);
        const totalKg = round1(bags.reduce((s, n) => s + n, 0));
        const ratePerKg = seasonalRate(material, cursor);
        const totalAmount = round2(totalKg * ratePerKg);
        lines.push({
          material: material._id,
          materialName: material.name,
          ratePerKg,
          bags: bags.map((kgs) => ({ kgs })),
          bagCount: bags.length,
          totalKg,
          totalAmount,
        });
        materialsTotal += totalAmount;
        totalBags += bags.length;
        totalWeight += totalKg;
      }

      materialsTotal = round2(materialsTotal);
      totalWeight = round1(totalWeight);
      const coolyOn = customer.handlingCharges ? rand() < 0.7 : rand() < 0.18;
      const coolyPerBag = coolyOn && rand() < 0.75;
      const coolyRate = coolyOn ? irand(8, 16) : 0;
      const handlingCharges = coolyOn
        ? coolyPerBag
          ? round2(coolyRate * totalBags)
          : coolyRate
        : 0;
      const saleTotal = round2(materialsTotal + handlingCharges);
      const when = atDay(cursor, irand(8, 17), irand(0, 59));
      const saleId = new mongoose.Types.ObjectId();

      salesBuf.push({
        _id: saleId,
        customer: customer._id,
        vendor: slot.vendor._id,
        load: slot.loadId,
        lines,
        handlingCharges,
        coolyRate,
        coolyPerBag,
        totalAmount: saleTotal,
        totalBags,
        totalWeight,
        createdAt: when,
        updatedAt: when,
      });

      slot.soldKg += totalWeight;
      slot.soldAmt += materialsTotal;
      slot.bags += totalBags;

      const cAfter = bump(custBal, customer._id, saleTotal);
      const vAfter = bump(vendBal, slot.vendor._id, materialsTotal);

      txBuf.push({
        customer: customer._id,
        type: 'customer_credit',
        amount: saleTotal,
        description: `Sale - ${lines.map((l) => l.materialName).join(', ')}`,
        sale: saleId,
        balanceAfter: cAfter,
        entryDate: when,
        source: 'demo_seed',
        createdAt: when,
        updatedAt: when,
      });
      txBuf.push({
        vendor: slot.vendor._id,
        type: 'vendor_credit',
        amount: materialsTotal,
        description: `Sale to ${customer.name} - ${lines.map((l) => l.materialName).join(', ')}`,
        sale: saleId,
        balanceAfter: vAfter,
        entryDate: when,
        source: 'demo_seed',
        createdAt: when,
        updatedAt: when,
      });
    }

    for (const slot of loadByVendor.values()) {
      if (slot.soldKg < 20) continue;
      const mat = pick(materials);
      const totalKg = round1(slot.soldKg * (1.05 + rand() * 0.2));
      const ratePerKg = Math.max(5, seasonalRate(mat, cursor) - irand(1, 4));
      const amount = round2(totalKg * ratePerKg);
      const when = atDay(cursor, 7, irand(0, 40));
      purchaseBuf.push({
        vendor: slot.vendor._id,
        purchaseDate: when,
        lines: [
          {
            material: mat._id,
            materialName: mat.name,
            totalKg,
            ratePerKg,
            amount,
          },
        ],
        totalAmount: amount,
        totalWeight: totalKg,
        notes: 'demo_seed',
        createdAt: when,
        updatedAt: when,
      });
      const vAfter = bump(vendBal, slot.vendor._id, amount);
      txBuf.push({
        vendor: slot.vendor._id,
        type: 'vendor_credit',
        amount,
        description: `Purchase — ${mat.name}`,
        balanceAfter: vAfter,
        entryDate: when,
        source: 'purchase',
        createdAt: when,
        updatedAt: when,
      });
    }

    const payers = [...dayCustomers].filter(() => rand() < 0.42);
    for (const customer of payers) {
      const owed = custBal.get(String(customer._id)) || 0;
      if (owed < 200) continue;
      const cash = round2(Math.min(owed * (0.35 + rand() * 0.55), owed));
      const less = rand() < 0.08 ? irand(10, 80) : 0;
      const applied = round2(cash + less);
      const when = atDay(cursor, irand(16, 19));
      const after = bump(custBal, customer._id, -applied);
      txBuf.push({
        customer: customer._id,
        type: 'customer_payment',
        amount: applied,
        lessAmount: less,
        cashSide: 'credit',
        entryDate: when,
        source: 'cash_entry',
        description: `Cash receipt · Amount ${cash}${less ? ` · Less ${less}` : ''} — ${customer.name}`,
        balanceAfter: Math.max(0, after),
        createdAt: when,
        updatedAt: when,
      });
      if (after < 0) custBal.set(String(customer._id), 0);
    }

    if (cursor.getDay() === 6 || rand() < 0.18) {
      for (const slot of [...loadByVendor.values()].slice(0, irand(1, 3))) {
        const owed = vendBal.get(String(slot.vendor._id)) || 0;
        if (owed < 500) continue;
        const cash = round2(Math.min(owed * (0.4 + rand() * 0.4), owed));
        const when = atDay(cursor, 18, irand(0, 40));
        const after = bump(vendBal, slot.vendor._id, -cash);
        txBuf.push({
          vendor: slot.vendor._id,
          type: 'vendor_payment',
          amount: cash,
          lessAmount: 0,
          cashSide: 'debit',
          entryDate: when,
          source: 'cash_entry',
          description: `Vendor payment · Amount ${cash} — ${slot.vendor.name}`,
          balanceAfter: Math.max(0, after),
          createdAt: when,
          updatedAt: when,
        });
        if (after < 0) vendBal.set(String(slot.vendor._id), 0);
      }
    }

    if (cursor.getDay() === 1 || (sunday && rand() < 0.4)) {
      const entries = [];
      const n = irand(18, 40);
      for (let i = 0; i < n; i += 1) {
        entries.push({
          customerName: pick(customers).name,
          materialName: pick(materials).name,
          bags: irand(1, 12),
        });
      }
      const when = atDay(cursor, 9);
      reportBuf.push({
        title: `${cursor.getDate()}/${cursor.getMonth() + 1}/${String(cursor.getFullYear()).slice(-2)} bag order`,
        entries,
        createdBy: salesUser?._id || null,
        createdAt: when,
        updatedAt: when,
      });
    }

    if (salesBuf.length > 1200) await flush();
    cursor.setDate(cursor.getDate() + 1);
  }

  await flush();
  if (reportBuf.length) await insertChunks(SalesBagReport, reportBuf, 200);

  const custOps = [...custBal.entries()].map(([id, creditBalance]) => ({
    updateOne: { filter: { _id: id }, update: { $set: { creditBalance: Math.max(0, round2(creditBalance)) } } },
  }));
  const vendOps = [...vendBal.entries()].map(([id, creditBalance]) => ({
    updateOne: { filter: { _id: id }, update: { $set: { creditBalance: Math.max(0, round2(creditBalance)) } } },
  }));
  if (custOps.length) await Customer.bulkWrite(custOps);
  if (vendOps.length) await Vendor.bulkWrite(vendOps);

  const [saleN, txN, loadN, buyN, reportN] = await Promise.all([
    Sale.countDocuments(),
    Transaction.countDocuments(),
    Load.countDocuments(),
    Purchase.countDocuments(),
    SalesBagReport.countDocuments(),
  ]);

  console.log('Demo seed complete for local session.');
  console.log(`Working days generated: ${dayCount}`);
  console.log(`Customers: ${customers.length}  Vendors: ${vendors.length}  Materials: ${materials.length}`);
  console.log(`Sales: ${saleN}  Transactions: ${txN}  Loads: ${loadN}  Purchases: ${buyN}  Bag reports: ${reportN}`);
  process.exit(0);
};

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
