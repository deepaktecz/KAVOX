# KAVOX Auth Service

Complete JWT-based Authentication Microservice for the KAVOX platform.

---

## 📁 Folder Structure

```
auth/
├── config/
│   ├── database.js        # MongoDB connection
│   └── redis.js           # Redis connection + helpers
├── controllers/
│   └── authController.js  # All auth logic (register/login/reset etc.)
├── middleware/
│   ├── authMiddleware.js   # JWT protect + role restrict
│   ├── errorMiddleware.js  # Global error handler
│   ├── rateLimiter.js      # Rate limiting configs
│   └── validationMiddleware.js # express-validator rules
├── models/
│   └── User.js            # Mongoose schema (user/seller/admin)
├── routes/
│   └── authRoutes.js      # Express router - all endpoints
├── tests/
│   └── auth.test.js       # Jest integration tests
├── utils/
│   ├── emailUtils.js      # Nodemailer + HTML templates
│   ├── jwtUtils.js        # Token generation + verification
│   ├── logger.js          # Winston logger
│   ├── otpUtils.js        # OTP generate + hash + compare
│   └── responseUtils.js   # Standard response helpers
├── .env.example           # Environment variables template
├── package.json
└── server.js              # Entry point
```

---

## 🚀 Setup & Run Guide

### Step 1 — Prerequisites

Install these before starting:
- Node.js >= 18.x → https://nodejs.org
- MongoDB >= 6.x → https://www.mongodb.com/try/download
- Redis >= 7.x → https://redis.io/download

### Step 2 — Install Dependencies

```bash
cd server/services/auth
npm install
```

### Step 3 — Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your actual values:

```env
NODE_ENV=development
PORT=5001
MONGO_URI=mongodb://localhost:27017/kavox_auth
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_ACCESS_SECRET=your_min_32_char_secret_here_change_me
JWT_REFRESH_SECRET=your_min_32_char_refresh_secret_change
SMTP_USER=your@gmail.com
SMTP_PASS=your_gmail_app_password
```

**Gmail App Password Setup:**
1. Google Account → Security → 2-Step Verification → Enable
2. App Passwords → Generate password for "Mail"
3. Use that 16-char password in SMTP_PASS

### Step 4 — Start MongoDB & Redis

**macOS (Homebrew):**
```bash
brew services start mongodb-community
brew services start redis
```

**Ubuntu/Linux:**
```bash
sudo systemctl start mongod
sudo systemctl start redis
```

**Windows:**
```bash
# MongoDB
net start MongoDB
# Redis
redis-server
```

**Docker (easiest):**
```bash
docker run -d -p 27017:27017 --name kavox-mongo mongo:7
docker run -d -p 6379:6379 --name kavox-redis redis:alpine
```

### Step 5 — Run in Development

```bash
npm run dev
```

You should see:
```
✅ MongoDB connected: localhost
✅ Redis connected
🚀 KAVOX Auth Service running on port 5001 [development]
```

### Step 6 — Run Tests

```bash
npm test
```

---

## 📡 API Reference

**Base URL:** `http://localhost:5001/api/v1/auth`

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register` | Register new account |
| POST | `/verify-email` | Verify email with OTP |
| POST | `/resend-otp` | Resend OTP |
| POST | `/login` | Login with email + password |
| POST | `/refresh-token` | Refresh access token |
| POST | `/forgot-password` | Request password reset OTP |
| POST | `/reset-password` | Reset password with OTP |

### Protected Endpoints (requires `Authorization: Bearer <token>`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/me` | Get current user |
| PATCH | `/me` | Update profile |
| POST | `/logout` | Logout current session |
| POST | `/logout-all` | Logout all devices |
| POST | `/change-password` | Change password |
| POST | `/addresses` | Add address |
| PATCH | `/addresses/:id` | Update address |
| DELETE | `/addresses/:id` | Delete address |

### Admin Endpoints (role: admin/super_admin)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/users` | List all users |
| GET | `/admin/users/:id` | Get user by ID |
| PATCH | `/admin/users/:id/toggle-status` | Activate/deactivate |
| PATCH | `/admin/sellers/:id/approve` | Approve seller |

### Internal (Gateway only, requires X-Service-Secret header)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/internal/users/:id/verify` | Verify user for other services |

---

## 🔑 Request/Response Examples

### Register
```json
POST /api/v1/auth/register
{
  "firstName": "Rahul",
  "lastName": "Sharma",
  "email": "rahul@example.com",
  "password": "Secure@123",
  "confirmPassword": "Secure@123",
  "role": "user"
}

Response 201:
{
  "success": true,
  "message": "Account created! Please check your email for the OTP.",
  "data": {
    "userId": "65abc...",
    "email": "rahul@example.com",
    "requiresVerification": true
  }
}
```

### Login
```json
POST /api/v1/auth/login
{
  "email": "rahul@example.com",
  "password": "Secure@123"
}

Response 200:
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "user": { "_id": "...", "firstName": "Rahul", "role": "user", ... },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "tokenType": "Bearer"
  }
}
```

---

## 🔐 Security Features

- ✅ bcrypt password hashing (12 rounds)
- ✅ JWT access tokens (15m) + refresh tokens (7d)
- ✅ Refresh token rotation
- ✅ Token blacklisting (logout)
- ✅ Account lockout after 5 failed attempts
- ✅ Rate limiting (10 auth attempts per 15 min)
- ✅ OTP attempt limiting (3 max)
- ✅ Input sanitization (mongo-sanitize + hpp)
- ✅ Helmet security headers
- ✅ CORS configured
- ✅ HttpOnly secure cookies for refresh tokens

---

## 🏗️ User Roles

| Role | Description |
|------|-------------|
| `user` | Regular customer |
| `seller` | Seller who lists products |
| `admin` | Platform administrator |
| `super_admin` | Full platform access |

---

## 📝 Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| PORT | No | 5001 | Service port |
| MONGO_URI | Yes | - | MongoDB connection string |
| REDIS_HOST | No | localhost | Redis host |
| REDIS_PORT | No | 6379 | Redis port |
| JWT_ACCESS_SECRET | Yes | - | Min 32 chars |
| JWT_REFRESH_SECRET | Yes | - | Min 32 chars |
| JWT_ACCESS_EXPIRE | No | 15m | Access token TTL |
| JWT_REFRESH_EXPIRE | No | 7d | Refresh token TTL |
| SMTP_HOST | No | smtp.gmail.com | SMTP server |
| SMTP_USER | Yes (for email) | - | Email username |
| SMTP_PASS | Yes (for email) | - | Email password |
| BCRYPT_ROUNDS | No | 12 | Hash rounds |
| OTP_EXPIRE_MINUTES | No | 10 | OTP validity |
| GATEWAY_SECRET | Yes | - | Inter-service auth |
