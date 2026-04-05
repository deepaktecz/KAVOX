# KAVOX — Full-Stack eCommerce Platform
 
Premium print-on-demand eCommerce platform with Amazon/Flipkart-level features, custom design studio, Qikink integration, and Razorpay payments.

---

## 📁 Project Structure
 
```
kavox-platform/
├── client/                    # Next.js 14 frontend
│   └── src/
│       ├── app/               # App Router pages
│       │   ├── page.tsx           # Homepage
│       │   ├── shop/              # Product listing + filters
│       │   ├── auth/              # Login / Register
│       │   ├── checkout/          # Checkout + Razorpay
│       │   ├── orders/            # Order history
│       │   ├── design-studio/     # Custom T-shirt designer
│       │   └── admin/dashboard/   # Admin panel
│       ├── components/        # Reusable UI components
│       │   ├── layout/Navbar.tsx
│       │   ├── cart/CartSidebar.tsx
│       │   ├── ui/index.tsx       # ProductCard, Toast, etc.
│       │   └── auth/AuthPages.tsx
│       ├── store/             # Redux Toolkit
│       │   └── slices/        # auth, cart, wishlist, ui, product
│       ├── hooks/             # Custom hooks
│       └── lib/api.ts         # All API calls + Axios interceptors
│
└── server/
    ├── gateway/index.js       # API Gateway (Socket.io + all routes)
    └── services/
        ├── auth/              # ✅ Complete - 15+ endpoints
        │   ├── server.js
        │   ├── models/User.js
        │   ├── controllers/authController.js
        │   ├── routes/authRoutes.js
        │   └── tests/auth.test.js
        ├── product/           # ✅ Complete - CRUD + reviews + search
        ├── order/             # ✅ Complete - full lifecycle + analytics
        ├── payment/           # ✅ Complete - Razorpay + webhook
        └── qikink/            # ✅ Complete - POD integration
```

---

## 🚀 Complete Setup & Run Guide

### Prerequisites

```bash
node -v    # must be >= 18.x
mongod --version   # must be >= 6.x
redis-server --version  # must be >= 7.x
```

Install if missing:
- Node.js: https://nodejs.org
- MongoDB: https://www.mongodb.com/try/download/community
- Redis: https://redis.io/download

---

### Step 1 — Clone & Install

```bash
# Install all dependencies
cd kavox-platform/server && npm install
cd ../client && npm install
```

---

### Step 2 — Configure Environment

```bash
# Server config
cp server/.env.example server/.env

# Edit server/.env with your values:
nano server/.env
```

**Minimum required values:**
```env
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb://localhost:27017/kavox
JWT_ACCESS_SECRET=kavox_access_min_32_chars_change_this_now
JWT_REFRESH_SECRET=kavox_refresh_min_32_chars_change_this_now
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_razorpay_secret
```

```bash
# Client config
cp client/.env.example client/.env.local

# Edit client/.env.local:
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxxxx
```

---

### Step 3 — Start MongoDB & Redis

**macOS:**
```bash
brew services start mongodb-community
brew services start redis
```

**Linux (Ubuntu/Debian):**
```bash
sudo systemctl start mongod
sudo systemctl start redis-server
```

**Windows:**
```bash
net start MongoDB
redis-server
```

**Docker (Recommended):**
```bash
docker run -d --name kavox-mongo -p 27017:27017 mongo:7
docker run -d --name kavox-redis -p 6379:6379 redis:alpine
```

---

### Step 4 — Get API Keys

#### Razorpay (Payments)
1. Go to https://dashboard.razorpay.com
2. Sign up → Settings → API Keys → Generate Test Key
3. Copy Key ID and Key Secret → paste in `.env`

#### Cloudinary (Image Storage)
1. https://cloudinary.com → Sign up free
2. Dashboard → Copy Cloud Name, API Key, API Secret

#### Qikink (Print-on-Demand)
1. https://qikink.com → Register as reseller
2. API section → Get your API key

#### Gmail SMTP (Emails)
1. Google Account → Security → Enable 2FA
2. App Passwords → Generate → Use in `SMTP_PASS`

---

### Step 5 — Run the App

**Terminal 1 — Backend:**
```bash
cd kavox-platform/server
node gateway/index.js
# OR with auto-restart:
npx nodemon gateway/index.js
```

You should see:
```
✅ MongoDB connected: localhost
✅ Redis connected
🚀 KAVOX API Gateway on :5000 [development]
📡 API: http://localhost:5000/api/v1
❤️  Health: http://localhost:5000/health
```

**Terminal 2 — Frontend:**
```bash
cd kavox-platform/client
npm run dev
```

You should see:
```
▲ Next.js 14.0.4
- Local:    http://localhost:3000
- Ready in 2.5s
```

**Open in browser:** http://localhost:3000

---

### Step 6 — Run Tests

```bash
cd server/services/auth
npm test
```

---

## 🔑 API Endpoints Reference

**Base URL:** `http://localhost:5000/api/v1`

### Auth
```
POST   /auth/register          # Register (user or seller)
POST   /auth/verify-email      # Verify email OTP
POST   /auth/resend-otp        # Resend OTP
POST   /auth/login             # Login
POST   /auth/logout            # Logout
POST   /auth/refresh-token     # Refresh access token
POST   /auth/forgot-password   # Request reset OTP
POST   /auth/reset-password    # Reset password
GET    /auth/me                # Get profile (auth required)
PATCH  /auth/me                # Update profile
POST   /auth/change-password   # Change password
POST   /auth/addresses         # Add address
PATCH  /auth/addresses/:id     # Update address
DELETE /auth/addresses/:id     # Delete address
```

### Products
```
GET    /products               # List + filter + paginate
GET    /products/featured      # Featured products
GET    /products/trending      # Bestsellers
GET    /products/new-arrivals  # New products
GET    /products/categories    # Category list with counts
GET    /products/search?q=     # Full-text search
GET    /products/recommendations # AI recommendations
GET    /products/:slugOrId     # Single product
POST   /products               # Create (seller auth)
PUT    /products/:id           # Update (seller auth)
DELETE /products/:id           # Delete (seller auth)
POST   /products/:id/reviews   # Add review (auth)
PATCH  /products/:id/review    # Approve/reject (admin)
```

### Orders
```
POST   /orders                     # Place order (auth)
GET    /orders/my-orders           # My orders (auth)
GET    /orders/my-orders/:id       # Order detail (auth)
POST   /orders/my-orders/:id/cancel # Cancel (auth)
POST   /orders/my-orders/:id/return # Request return (auth)
GET    /orders/track               # Public tracking
GET    /orders/seller/orders       # Seller orders (seller auth)
GET    /orders/admin/all           # All orders (admin)
GET    /orders/admin/analytics     # Analytics (admin)
PATCH  /orders/admin/:id/status    # Update status (admin)
```

### Payments
```
POST   /payments/create-order  # Create Razorpay order
POST   /payments/verify        # Verify payment
POST   /payments/webhook       # Razorpay webhook
GET    /payments/status/:id    # Payment status
POST   /payments/refund        # Initiate refund (admin)
```

---

## 👤 User Roles & Access

| Role | Access |
|------|--------|
| `user` | Shop, cart, orders, profile |
| `seller` | + Create/manage products, seller orders |
| `admin` | + All users, all orders, analytics, approve products |
| `super_admin` | Full access |

---

## 💳 Payment Flow (All goes to Admin)

```
Customer pays ₹999
       ↓
Razorpay processes (Admin's account receives)
       ↓
Webhook confirms payment
       ↓
KAVOX marks order as "confirmed"
       ↓
System sends to Qikink for printing
       ↓
Profit tracked: ₹999 - ₹499 (base) = ₹500 profit
```

---

## 🖨️ Qikink Integration

Qikink is the print-on-demand fulfillment partner:

1. **Catalog Sync** — `POST /api/v1/qikink/sync-catalog` (Admin)
2. **Design Upload** — Upload PNG/SVG → Qikink design ID
3. **Order Submit** — After payment, auto-submit to Qikink
4. **Tracking** — Webhooks update order status in real-time

---

## ⚡ Key Features

| Feature | Status |
|---------|--------|
| JWT Auth (access + refresh) | ✅ |
| Email OTP verification | ✅ |
| Role-based access control | ✅ |
| Product CRUD + reviews | ✅ |
| Smart search (text index) | ✅ |
| Cart system (localStorage) | ✅ |
| Wishlist (localStorage) | ✅ |
| Razorpay payments | ✅ |
| Qikink POD integration | ✅ |
| Order tracking + Socket.io | ✅ |
| Admin analytics dashboard | ✅ |
| Design Studio | ✅ |
| AI Recommendations | ✅ |
| Redis caching | ✅ |
| Rate limiting | ✅ |

---

## 🔧 Troubleshooting

**MongoDB won't connect:**
```bash
# Check if running
mongod --version
sudo systemctl status mongod
# Start manually
mongod --dbpath /data/db
```

**Redis connection failed:**
- App works without Redis (caching disabled). Non-fatal.

**Razorpay test mode:**
- Use test cards: `4111 1111 1111 1111` (Visa)
- CVV: any 3 digits, Expiry: any future date

**Email not sending:**
- Check Gmail App Password setup
- Enable 2FA first, then generate App Password

**Port 5000 in use:**
```bash
lsof -i :5000
kill -9 <PID>
# Or change PORT in .env
```

---

## 📦 Production Deployment

```bash
# Build client
cd client && npm run build

# Set production env
NODE_ENV=production
COOKIE_SECURE=true
COOKIE_SAME_SITE=strict

# Use PM2 for server
npm install -g pm2
pm2 start server/gateway/index.js --name kavox-api
pm2 startup && pm2 save

# Nginx reverse proxy recommended
```
