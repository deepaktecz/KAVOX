# 🚀 KAVOX - Production Deployment Guide

> Deploy Kavox eCommerce Platform to Production

## 📋 Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CDN (Cloudflare)                        │
│              (Images • Static Assets • Cache)               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Load Balancer (Nginx/HAProxy)                  │
│           (SSL Termination • Request Routing)               │
└─────────────────────────────────────────────────────────────┘
                            ↓
       ┌────────────────────────────────────────┐
       │   Kubernetes Cluster / Docker Swarm    │
       │                                        │
       ├──────────────────────────────────────┤
       │ Frontend (Next.js) - 2-3 replicas    │
       │ API Gateway - 2-3 replicas           │
       │ Microservices (8x) - 2 replicas each │
       └────────────────────────────────────────┘
                            ↓
       ┌────────────────────────────────────────┐
       │    Data Layer (Managed Services)      │
       │                                        │
       ├──────────────────────────────────────┤
       │ MongoDB Atlas (Cloud)                 │
       │ Redis Cloud                           │
       │ Elasticsearch Cloud                   │
       └────────────────────────────────────────┘
```

## 🌐 Hosting Options

### Option 1: AWS (Recommended for Scale)

**Services:**
- **EC2/ECS**: Docker containers (microservices)
- **ALB**: Load balancer
- **RDS**: Managed MongoDB (DocumentDB)
- **ElastiCache**: Redis
- **Elasticsearch Service**: Managed ES
- **CloudFront**: CDN
- **S3**: Asset storage
- **Route53**: DNS
- **CloudWatch**: Monitoring
- **Secrets Manager**: Sensitive data

### Option 2: Google Cloud Platform

**Services:**
- **GKE**: Kubernetes cluster
- **Cloud Load Balancing**: Load balancer
- **Firestore/MongoDB Atlas**: Database
- **Memorystore**: Redis
- **Elasticsearch**: Managed
- **Cloud Storage**: Asset storage
- **Cloud CDN**: CDN
- **Cloud DNS**: DNS

### Option 3: DigitalOcean (Budget-Friendly)

**Services:**
- **App Platform**: Container deployment
- **Managed Kubernetes**: K8s cluster
- **Managed Databases**: MongoDB & Redis
- **Spaces**: Object storage (S3-compatible)
- **Monitoring**: Datadog integration

### Option 4: Self-Hosted (Advanced)

**Requirements:**
- **2-3 servers minimum** (8CPU, 16GB RAM each)
- **Load balancer** (Nginx, HAProxy)
- **Kubernetes or Docker Swarm**
- **Managed backups**
- **DDoS protection**

---

## 🏗️ Pre-Deployment Checklist

- [ ] SSL certificates (Let's Encrypt or commercial)
- [ ] DNS configuration
- [ ] Environment variables for production
- [ ] Database backups configured
- [ ] Monitoring & alerting setup
- [ ] CDN configured
- [ ] API rate limiting configured
- [ ] CORS properly configured for frontend domain
- [ ] Logging aggregation (ELK, Datadog, etc.)
- [ ] Error tracking (Sentry)
- [ ] Load testing completed
- [ ] Security audit performed
- [ ] Database migration scripts tested

---

## 📦 Docker Deployment

### 1. Build Images

```bash
cd server
docker build -t kavox-backend:1.0.0 .

cd ../client
docker build -t kavox-frontend:1.0.0 .
```

### 2. Push to Registry

```bash
# Docker Hub
docker tag kavox-backend:1.0.0 yourdockerhub/kavox-backend:1.0.0
docker push yourdockerhub/kavox-backend:1.0.0

docker tag kavox-frontend:1.0.0 yourdockerhub/kavox-frontend:1.0.0
docker push yourdockerhub/kavox-frontend:1.0.0

# Or AWS ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ECR_URI>
docker tag kavox-backend:1.0.0 <ECR_URI>/kavox-backend:1.0.0
docker push <ECR_URI>/kavox-backend:1.0.0
```

### 3. Deploy with Docker Compose (Production)

```bash
# Pull latest images
docker-compose pull

# Start services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Check health
docker-compose ps
curl http://localhost:3000/health
```

---

## ☸️ Kubernetes Deployment

### 1. Create Namespace

```bash
kubectl create namespace kavox
kubectl config set-context --current --namespace=kavox
```

### 2. Create Secrets

```bash
kubectl create secret generic kavox-secrets \
  --from-literal=JWT_SECRET=<your-jwt-secret> \
  --from-literal=RAZORPAY_KEY_ID=<key> \
  --from-literal=RAZORPAY_KEY_SECRET=<secret> \
  --from-literal=MONGODB_URI=<uri> \
  -n kavox

kubectl create secret generic kavox-qikink \
  --from-literal=QIKINK_API_KEY=<key> \
  --from-literal=QIKINK_API_URL=<url> \
  -n kavox
```

### 3. Deploy Services

```bash
# Create config map
kubectl create configmap kavox-config \
  --from-literal=API_BASE_URL=https://api.kavox.com \
  --from-literal=FRONTEND_URL=https://kavox.com \
  -n kavox

# Apply deployments
kubectl apply -f kubernetes/
```

### 4. Monitor Deployments

```bash
# Watch rollout
kubectl rollout status deployment/kavox-backend -n kavox

# Check pods
kubectl get pods -n kavox

# View logs
kubectl logs -f deployment/kavox-backend -n kavox
```

---

## 📊 Monitoring & Logging

### ELK Stack Setup

```bash
# Deploy ElasticStack
docker-compose -f docker-compose.logging.yml up -d

# Access Kibana
http://localhost:5601
```

### Datadog Integration

```bash
# Install Datadog agent
DD_AGENT_MAJOR_VERSION=7 \
DD_API_KEY=<your-api-key> \
DD_SITE=datadoghq.com \
bash -c "$(curl -L https://s3.amazonaws.com/dd-agent/scripts/install_agent.sh)"

# Configure environment
export DD_LOGS_INJECTION=true
export DD_TRACE_ENABLED=true
```

### Sentry Error Tracking

```javascript
// In server/index.js
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
```

---

## 🔒 Security Hardening

### 1. HTTPS/SSL

```bash
# Using Let's Encrypt with Certbot
certbot certonly --standalone -d api.kavox.com -d www.kavox.com

# Auto-renewal
certbot renew --dry-run
```

### 2. Database Security

```javascript
// MongoDB Atlas - Enable:
// - IP Whitelist
// - VPC Peering
// - Encryption at rest
// - Backup
// - Authentication
```

### 3. API Security

```javascript
// Rate Limiting (per IP)
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
});

app.use(limiter);
```

### 4. CORS Configuration

```javascript
const cors = require('cors');

app.use(cors({
  origin: ['https://kavox.com', 'https://www.kavox.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

### 5. Security Headers

```javascript
const helmet = require('helmet');

app.use(helmet());
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
  },
}));
```

---

## 📈 Scaling Configuration

### Horizontal Scaling (Kubernetes)

```yaml
# HorizontalPodAutoscaler
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: kavox-backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: kavox-backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Database Scaling

```javascript
// Connection pooling
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 10,
  minPoolSize: 5,
  retryWrites: true,
  maxStalenessSeconds: 5,
});
```

### Redis Cluster

```bash
# Multi-node Redis for caching
redis-cli --cluster create \
  127.0.0.1:7000 \
  127.0.0.1:7001 \
  127.0.0.1:7002 \
  --cluster-replicas 1
```

---

## 🚀 CI/CD Pipeline

### GitHub Actions Example

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Build Docker image
        run: docker build -t kavox-backend:${{ github.sha }} .
      
      - name: Push to ECR
        run: |
          aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
          docker push $ECR_REGISTRY/kavox-backend:${{ github.sha }}
      
      - name: Deploy to ECS
        run: |
          aws ecs update-service \
            --cluster kavox-prod \
            --service kavox-backend \
            --force-new-deployment
```

---

## 📊 Performance Optimization

### Caching Strategy

```javascript
// Redis caching for frequently accessed data
const redis = require('redis');
const client = redis.createClient();

// Cache products for 1 hour
app.get('/api/products', async (req, res) => {
  const cacheKey = `products:${JSON.stringify(req.query)}`;
  const cached = await client.get(cacheKey);
  
  if (cached) {
    return res.json(JSON.parse(cached));
  }
  
  const products = await Product.find(req.query);
  await client.setEx(cacheKey, 3600, JSON.stringify(products));
  res.json(products);
});
```

### CDN Configuration

```javascript
// Static asset headers for CDN caching
app.use(express.static('public', {
  maxAge: '1y',
  etag: false,
}));

// API response caching
app.set('Cache-Control', 'public, max-age=300');
```

### Database Indexing

```javascript
// Ensure indexes for frequently queried fields
db.products.createIndex({ category: 1, price: 1 });
db.orders.createIndex({ userId: 1, createdAt: -1 });
db.users.createIndex({ email: 1 }, { unique: true });
```

---

## 📋 Post-Deployment Checklist

- [ ] All services healthy (check `/health` endpoints)
- [ ] Database migrations completed
- [ ] Logging working correctly
- [ ] Monitoring alerts configured
- [ ] Backup schedule verified
- [ ] SSL certificate valid
- [ ] DNS propagated
- [ ] Performance baseline recorded
- [ ] Security audit completed
- [ ] Team informed of deployment
- [ ] Rollback plan documented
- [ ] Load testing passed

---

## 🔄 Rollback Procedure

```bash
# Kubernetes rollback
kubectl rollout undo deployment/kavox-backend -n kavox

# View history
kubectl rollout history deployment/kavox-backend -n kavox

# Rollback to specific revision
kubectl rollout undo deployment/kavox-backend --to-revision=2 -n kavox
```

---

## 📞 Support & Maintenance

**Scheduled Maintenance Windows:**
- Tuesday 2-4 AM UTC
- Announced 48 hours in advance
- ~15-30 minutes downtime

**On-Call Rotation:**
- Backend: DevOps team
- Database: DBA team
- Frontend: Frontend team

**Incident Response:**
- Critical: Page on-call immediately
- Major: Initiate incident response
- Minor: Log and schedule fix

---

**Version:** 1.0.0  
**Last Updated:** 2026-04-05  
**Maintained by:** Kavox DevOps Team
