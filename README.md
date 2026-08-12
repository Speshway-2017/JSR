# JSR — Vendor Load Tracking & POS Billing

A full-stack MERN application for agricultural trading businesses. Manage vendors, record incoming loads, track vendor credit, set material prices, and bill customers via a simple POS — all with a clean, mobile-friendly UI.

## Features

- **Single login** — Email & password authentication
- **Vendor management** — Name, mobile, city, address, support charges toggle
- **Load entry** — Select vendor, add multiple materials with multiple bag types per material, set buying rate per kg, auto-calculate totals
- **Credit tracking** — Loads automatically add credit to vendor balance
- **Material pricing** — Set selling prices for POS billing
- **POS billing** — Cash-only customer billing with auto-filled prices
- **Vendor detail** — Supply history, credit balance, payment history
- **Payments** — Record vendor payments to reduce credit balance
- **Transaction history** — Filter by vendor and type (credit, payment, sale)

## Color Palette

Designed for agricultural/trading context:
- **Primary Green** `#2D6A4F` — trust, growth, agriculture
- **Accent Tan** `#D4A373` — warmth, earth tones
- **Cream Background** `#F8F9F4` — easy on the eyes for long use

## Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS, React Router, Axios
- **Backend:** Node.js, Express, MongoDB, Mongoose, JWT, bcrypt
- **Database:** Local MongoDB

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [MongoDB](https://www.mongodb.com/try/download/community) running locally on `mongodb://127.0.0.1:27017`

## Desktop installer (give clients a single .exe)

Clients do **not** need Node, MongoDB, or your source code. The Windows installer bundles:

- JSR UI  
- Express API  
- Embedded MongoDB (data stored on that PC under the app’s user data folder)

### Build the Windows installer (on Windows)

```bash
# once
npm install
npm install --prefix server
npm install --prefix client

# creates release/JSR-Setup-1.0.0.exe
npm run dist:win
```

Optional no-install build: `npm run dist:win:portable` → `JSR-Portable-1.0.0.exe`

### What the client does

1. Run `JSR-Setup-1.0.0.exe`  
2. If SmartScreen appears: **More info** → **Run anyway** (unsigned build is normal)  
3. Finish the installer, open **JSR**  
4. Login: `admin@jsr.com` / `admin123`  

### If Setup won’t install / hangs

1. Close any running JSR / AgriTrades  
2. Delete old folders if present:
   - `%LOCALAPPDATA%\Programs\JSR`
   - `%LOCALAPPDATA%\Programs\AgriTrades`
3. Run Setup again as Administrator (right-click → Run as administrator)  
4. Or use portable: `npm run dist:win:portable`

### Notes

- Installer is large (~200MB+) because MongoDB is included  
- Build on the same OS you target when possible (Windows → Windows `.exe`)  
- For macOS DMG: `npm run dist:mac`  
- Data lives on the client PC under the app userData folder

## Desktop app (Electron) — development

Requires MongoDB running locally (same as web).

### Install (once)

```bash
# from repo root
npm install
npm install --prefix server
npm install --prefix client
```

### Development (desktop window + hot reload)

```bash
npm run electron:dev
```

Reuses API/Vite if ports `5050` / `3000` are already healthy; otherwise starts them, then opens Electron.

If client and server are already running in other terminals:

```bash
npm run electron:open
```

### Production-style desktop run

Builds the client, starts the API inside Electron, and loads the app:

```bash
npm run electron:start
```

### Window controls

- **Close / Quit** — asks for confirmation before quitting
- **Minimize / Maximize** — title-bar buttons (Windows/Linux) or traffic lights + menu (macOS)
- **Menu** — File, Edit, View (reload, zoom, fullscreen), Window (minimize, maximize, close)

Keyboard: `Cmd/Ctrl+M` minimize, `Cmd/Ctrl+Shift+M` maximize, `Cmd/Ctrl+Q` quit (with confirm).

## Setup (web browser)

Client and server are separate apps — install and run each in its own terminal.

### 1. Configure environment

Copy `server/.env.example` to `server/.env` (or use the included defaults):

```
PORT=5050
MONGODB_URI=mongodb://127.0.0.1:27017/agriTrades
JWT_SECRET=your_secret_key
ADMIN_EMAIL=admin@jsr.com
ADMIN_PASSWORD=admin123
SALES_EMAIL=sales@jsr.com
SALES_PASSWORD=sales123
```

### 2. Backend (server)

```bash
cd server
npm install
npm run seed    # first time only — seeds admin user
npm run dev
```

API: http://localhost:5050

### 3. Frontend (client)

```bash
cd client
npm install
npm run dev
```

App: http://localhost:3000

### Default Login

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@jsr.com | admin123 |
| Sales | sales@jsr.com | sales123 |

Sales users only see **Sales Orders** (customer + material bag list → Excel export). Admin keeps full access.

## Usage Flow

1. **Login** with admin credentials
2. **Add Vendors** — Register suppliers like "Manoj"
3. **Add Load** — Select vendor, add materials (Mirchi, Tomato), enter bag details and buying rates
4. **Materials** — Set selling prices for POS
5. **POS Billing** — Bill walk-in customers (cash only)
6. **Vendor Detail** — View supply history, credit, record payments
7. **Transactions** — View all credits, payments, and sales

## Example Load Entry

Vendor: **Manoj**

| Material | Bags | Kg/Bag | Rate/Kg |
|----------|------|--------|---------|
| Mirchi   | 10   | 20     | ₹50     |
| Mirchi   | 12   | 16     | ₹50     |
| Tomato   | 9    | 10     | ₹30     |
| Tomato   | 20   | 14     | ₹30     |

Total buying amount is calculated automatically and saved as vendor credit.

## Project Structure

```
agriTrades/
├── client/          # React frontend (Vite) — own package.json
│   └── src/
│       ├── pages/
│       ├── components/
│       └── api/
└── server/          # Express backend — own package.json
    ├── models/
    ├── routes/
    └── scripts/     # Database seed
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login |
| GET | `/api/vendors` | List vendors |
| POST | `/api/vendors` | Create vendor |
| GET | `/api/vendors/:id` | Vendor detail with history |
| POST | `/api/loads` | Create load (adds credit) |
| GET/POST | `/api/materials` | Manage materials |
| POST | `/api/sales` | POS sale |
| POST | `/api/transactions/payment` | Record vendor payment |
| GET | `/api/transactions` | Transaction history |

## License

MIT
