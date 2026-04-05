# 🚀 KAVOX - Setup Guide

> Full-Stack eCommerce Platform with Qikink POD Integration

## 📋 Prerequisites

- **Node.js** v16+ and **npm** v8+
- **MongoDB** 7.0+ or Docker
- **Redis** 7.0+ (optional, for caching)
- **ElasticSearch** 8.0+ (for search functionality)

## ⚡ Quick Start - Docker (Recommended)

### 1. Clone & Setup

```bash
cd server
cp .env.example .env
# Edit .env with your API keys
```

### 2. Start All Services with Docker Compose

```bash
docker-compose up -d
```

This starts:
- ✅ MongoDB (27017)
- ✅ Redis (6379)
- ✅ ElasticSearch (9200)
- ✅ Kibana (5601)
- ✅ API Gateway (3000)
- ✅ All 8 Microservices (3001-3009)

### 3. Verify Services

```bash
curl http://localhost:3000/health
curl http://localhost:3000/status
```

### 4. Check Logs

```bash
docker-compose logs -f gateway
docker-compose logs -f auth
# Or any service name
```

---

## 🖥️ Local Development (Without Docker)

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Setup MongoDB

```bash
# Option A: Install locally (macOS)
brew install mongodb-community
brew services start mongodb-community

# Option B: Run MongoDB in Docker only
docker run -d -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password123 \
  mongo:7.0
```

### 3. Setup RedisElasticsearch

```bash
# Redis
docker run -d -p 6379:6379 redis:7-alpine

# ElasticSearch
docker run -d -p 9200:9200 \
  -e discovery.type=single-node \
  -e xpack.security.enabled=false \
  docker.elastic.co/elasticsearch/elasticsearch:8.11.0
```

### 4. Start Services

**Option A: All Services (Production)**
```bash
npm run start:all
```

**Option B: All Services with Hot Reload (Development)**
```bash
npm run dev:all
```

**Option C: Individual Services**
```bash
npm run start:auth
npm run start:product
npm run start:order
# etc...
```

---

## 📁 Project Structure

```
serverserver/
├── gateway/                 # API Gateway (port 3000)
│   └── index.js
├── microservices/
│   ├── auth/               # Auth Service (port 3001)
│   ├── product/            # Product Service (port 3002)
│   ├── order/              # Order Service (port 3003)
│   ├── payment/            # Payment Service (port 3004)
│   ├── qikink/             # Qikink POD Service (port 3005)
│   ├── search/             # Search Service (port 3006)
│   ├── recommendation/     # Recommendation Service (port 3007)
│   ├── seller/             # Seller Service (port 3008)
│   └── admin/              # Admin Service (port 3009)
├── middleware/
│   └── security.middleware.js
├── utils/
│   └── logger.js
└── .env.example
```

---

## 🔧 Environment Configuration

Copy `.env.example` to `.env` and update:

```bash
# Critical
JWT_SECRET=your-super-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
MONGODB_URI=mongodb://localhost:27017/kavox

# Payment
RAZORPAY_KEY_ID=your-razorpay-key
RAZORPAY_KEY_SECRET=your-razorpay-secret

# Qikink POD
QIKINK_API_URL=https://api.qikink.com
QIKINK_API_KEY=your-qikink-key

# OTP/SMS
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=+1234567890

# Search
ELASTICSEARCH_URL=http://localhost:9200
REDIS_URL=redis://localhost:6379
```

---

## 🧪 Testing Services

### Register User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "9876543210",
    "password": "password123",
    "role": "user"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

### Create Product
```bash
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Custom T-Shirt",
    "description": "High quality t-shirt",
    "category": "Apparel",
    "basePrice": 200,
    "sellingPrice": 299
  }'
```

### Search Products
```bash
curl "http://localhost:3000/api/search" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "query": "t-shirt",
    "limit": 20
  }'
```

---

## 📊 Admin Dashboard

After setting up frontend, access:
```
http://localhost:3000/admin
```

**Admin Credentials** (Need to be created first):
- Email: admin@kavox.com
- Password: (Create via auth service)
- Role: admin

---

## 🐛 Troubleshooting

### MongoDB Connection Error
```bash
# Check if MongoDB is running
mongo --eval "db.adminCommand('ping')"

# Or use Docker
docker run -d -p 27017:27017 mongo:7.0
```

### ElasticSearch Not Responding
```bash
# Check if running
curl http://localhost:9200

# Start in Docker
docker run -d -p 9200:9200 \
  -e discovery.type=single-node \
  -e xpack.security.enabled=false \
  docker.elastic.co/elasticsearch/elasticsearch:8.11.0
```

### Service Port in Use
```bash
# Kill process on specific port (macOS/Linux)
lsof -ti:3001 | xargs kill -9

# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

---

## 📈 Performance Tips

1. **Enable Redis Caching**
   ```bash
   export REDIS_URL=redis://localhost:6379
   ```

2. **Use ElasticSearch for Large Datasets**
   - Automatically indexes products
   - Fuzzy search with typo correction
   - Fast autocomplete

3. **Rate Limiting**
   - Default: 100 requests per 60 seconds per IP
   - Configurable via middleware

4. **Compression**
   - Gzip compression enabled by default
   - Reduces response size by ~70%

---

## 🔐 Security Checklist

- [ ] Update JWT secrets in .env
- [ ] Set strong database passwords
- [ ] Enable HTTPS in production
- [ ] Setup rate limiting appropriately
- [ ] Validate all user inputs
- [ ] Use environment variables for secrets
- [ ] Enable CORS only for trusted domains
- [ ] Setup SSL certificates

---

## 📋 Microservice Endpoints

### Auth Service (3001)
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/send-otp
POST   /api/auth/verify-otp
POST   /api/auth/refresh
GET    /api/auth/me
POST   /api/auth/logout
POST   /api/auth/verify (internal)
```

### Product Service (3002)
```
GET    /api/products
GET    /api/products/:id
POST   /api/products (seller)
PUT    /api/products/:id (seller)
POST   /api/products/:id/reviews
POST   /api/products/qikink/sync (admin)
GET    /api/products/categories
```

### Order Service (3003)
```
POST   /api/orders
GET    /api/orders/user/me
GET    /api/orders/:id
GET    /api/orders/:id/track
POST   /api/orders/:id/submit-qikink
PATCH  /api/orders/:id/status (admin)
POST   /api/orders/:id/return
POST   /api/orders/:id/approve-return (admin)
```

### Payment Service (3004)
```
POST   /api/payments/initiate
POST   /api/payments/verify
GET    /api/payments/:transactionId
POST   /api/payments/:transactionId/refund
POST   /api/payments/webhook (Razorpay)
```

### Qikink Service (3005)
```
POST   /api/qikink/designs/upload
GET    /api/qikink/designs
POST   /api/qikink/designs/:id/publish
POST   /api/qikink/orders/submit
GET    /api/qikink/orders/:id/track
POST   /api/qikink/webhook
```

### Search Service (3006)
```
POST   /api/search
GET    /api/search/suggest
GET    /api/search/categories
GET    /api/search/prices
GET    /api/search/trending
```

### Recommendation Service (3007)
```
GET    /api/recommendations/user
GET    /api/recommendations/frequently-bought/:productId
GET    /api/recommendations/trending
POST   /api/recommendations/track (internal)
```

### Seller Service (3008)
```
POST   /api/seller/profile
GET    /api/seller/profile
PUT    /api/seller/profile
GET    /api/seller/dashboard
GET    /api/seller/earnings
POST   /api/seller/payout/request
GET    /api/seller/payouts
```

### Admin Service (3009)
```
GET    /api/admin/dashboard
GET    /api/admin/analytics
GET    /api/admin/users
GET    /api/admin/orders
GET    /api/admin/products
GET    /api/admin/sellers
GET    /api/admin/reports/revenue
GET    /api/admin/metrics
```

---

## 📚 Additional Resources

- [JWT Authentication](https://github.com/auth0/node-jsonwebtoken)
- [Razorpay Docs](https://razorpay.com/docs)
- [Qikink API](https://developer.qikink.com)
- [MongoDB Guide](https://docs.mongodb.com)
- [ElasticSearch Guide](https://www.elastic.co/guide/en/elasticsearch/reference)

---

## 🤝 Support

For issues or questions:
1. Check logs: `logs/` directory
2. Review `.env` configuration
3. Ensure all services are running: `curl http://localhost:3000/status`

---

**Version:** 1.0.0  
**Last Updated:** 2026-04-05  
**Maintained by:** Kavox Team
