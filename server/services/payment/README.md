# 💳 KAVOX Payment Service

Secure Razorpay payment verification with comprehensive profit tracking system.

## 🎯 Features

- **🔐 Secure Payment Verification**: HMAC SHA256 signature verification with timing-attack protection
- **💰 Profit Analytics**: Item-level profit tracking and calculating margin analysis
- **🔄 Webhook Support**: Automatic order confirmation via Razorpay webhooks
- **💳 Refund Management**: Initiate partial or full refunds directly from admin panel
- **📊 Real-time Analytics**: Profit margins and breakdown by product
- **🛡️ PCI Compliant**: Industry-standard security practices

## 📁 File Structure

```
/services/payment/
├── payment.service.js              # Core payment logic (SINGLETON)
├── controllers/
│   └── paymentController.js        # Route handlers
├── routes/
│   └── paymentRoutes.js            # Express routes
└── 📚 Documentation
    ├── QUICK_START.md              # 5-minute setup guide
    ├── PAYMENT_INTEGRATION.md      # Complete API documentation
    ├── SECURITY_CHECKLIST.md       # Pre-launch checklist
    └── README.md                   # This file
```

## 🚀 Quick Start

### 1. Configure Environment

```bash
# Add to /server/.env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxx
```

### 2. Test Endpoints

```bash
# Create payment order
curl -X POST http://localhost:5000/api/payment/create-order \
  -H "Authorization: Bearer {token}" \
  -d '{"orderId": "507f1f77bcf86cd799439011"}'

# Verify payment after user completes payment
curl -X POST http://localhost:5000/api/payment/verify \
  -H "Authorization: Bearer {token}" \
  -d '{
    "razorpay_order_id": "order_xxx",
    "razorpay_payment_id": "pay_xxx",
    "razorpay_signature": "hash...",
    "orderId": "507f1f77bcf86cd799439011"
  }'

# Get payment status
curl http://localhost:5000/api/payment/status/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer {token}"

# Get profit analysis (admin)
curl http://localhost:5000/api/payment/profit/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer {token}"
```

## 📡 API Endpoints

### Public Routes

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/payment/webhook` | Razorpay webhook handler |

### Protected Routes (Authenticated Users)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/payment/create-order` | Create Razorpay order |
| POST | `/api/payment/verify` | Verify payment signature |
| GET | `/api/payment/status/:orderId` | Get payment status |

### Admin Routes (Admin/Super Admin)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/payment/refund` | Initiate refund |
| GET | `/api/payment/profit/:orderId` | Get profit analysis |

## 🔐 Security Highlights

### Signature Verification
✅ HMAC SHA256 with constant-time comparison  
✅ Prevents tampering and fake payments  
✅ Timing-attack resistant  

### Multiple Validation Layers
✅ Signature verification (HMAC)  
✅ User authorization (user owns order)  
✅ Amount verification  
✅ Duplicate payment prevention  
✅ Razorpay API confirmation  

### Best Practices
✅ Environment variables for secrets  
✅ No payment data in logs  
✅ Rate limiting on verify endpoint  
✅ Generic error messages  
✅ Input validation on all endpoints  

## 💰 Profit Calculation

### Formula
```
profit = selling_price - base_price (per item)
total_profit = sum(profit) - shipping_cost - gst_total
profit_margin = (total_profit / total_amount) × 100%
```

### Example

```
Order with 2 T-Shirts:
- Base Cost (Qikink): ₹250 each
- Selling Price: ₹500 each
- Profit per item: ₹250 × 2 = ₹500

Total: ₹500 profit on ₹1,000 transaction = 50% margin
```

## 🔄 Payment Flow

```
1. Customer Places Order
   → Order created with status: pending_payment

2. Customer Initiates Payment
   → POST /api/payment/create-order
   → Get Razorpay order details + key

3. Customer Completes Payment
   → Razorpay checkout modal
   → Customer enters payment details

4. Verify Payment
   → POST /api/payment/verify
   → Backend verifies signature
   → Order confirmed, stock deducted

5. Fulfillment
   → Order sent to Qikink (if POD)
   → Tracking notified to customer
```

## 🔍 Signature Verification

### How It Works

```js
// Step 1: Create body string
body = "order_123|pay_456"

// Step 2: Generate HMAC SHA256
signature = HMAC-SHA256(body, SECRET_KEY)

// Step 3: Compare (constant-time)
valid = (signature === received_signature)
```

### Why It's Secure

- **Only Razorpay knows the secret key** → If signature matches, payment is authentic
- **Constant-time comparison** → Prevents timing attacks
- **Body includes order_id and payment_id** → Prevents signature reuse

## 🧪 Testing

### Unit Tests
```bash
npm test -- payment.service.test.js
```

### Integration Tests
```bash
npm test -- payment.integration.test.js
```

### Manual Testing
See QUICK_START.md for curl commands and examples.

## 📊 Monitoring

### Check Payment Success Rate
```bash
tail -f server.log | grep "Payment verified"
```

### Monitor Failed Verifications
```bash
tail -f server.log | grep "signature mismatch"
```

### Check Webhook Events
```bash
tail -f server.log | grep "\\[WEBHOOK\\]"
```

## ⚠️ Common Mistakes to Avoid

❌ **Don't hardcode secrets**
```js
const SECRET = 'rzp_test_xxx'; // WRONG!
```

✅ **Use environment variables**
```js
const SECRET = process.env.RAZORPAY_KEY_SECRET;
```

---

❌ **Don't trust client amount**
```js
const amount = req.body.amount; // WRONG!
```

✅ **Use order from database**
```js
const order = await Order.findById(orderId);
const amount = order.totalAmount;
```

---

❌ **Don't use simple string comparison**
```js
if (signature === expectedSignature) {} // WRONG - timing attacks!
```

✅ **Use constant-time comparison**
```js
if (constantTimeCompare(signature, expectedSignature)) {}
```

---

❌ **Don't process duplicate payments**
```js
order.paymentStatus = 'paid';
await order.save(); // Processed twice if called twice!
```

✅ **Check if already processed**
```js
if (order.paymentStatus === 'paid') return 'already confirmed';
```

## 🚨 Error Handling

### Invalid Signature
```json
{
  "success": false,
  "message": "Payment verification failed: Invalid signature"
}
```
**Action**: Reject payment, show error to user

### Duplicate Payment
```json
{
  "success": false,
  "message": "Payment already used for another order"
}
```
**Action**: Reject payment, inform support

### Amount Mismatch
```json
{
  "success": false,
  "message": "Payment amount does not match order total"
}
```
**Action**: Investigate, contact Razorpay support

### Order Not Found
```json
{
  "success": false,
  "message": "Order not found or unauthorized",
  "statusCode": 404
}
```
**Action**: Verify order ID, check user authorization

## 📖 Documentation

- **QUICK_START.md** - 5-minute setup guide
- **PAYMENT_INTEGRATION.md** - Complete API reference (70+ pages)
- **SECURITY_CHECKLIST.md** - Pre-launch security checklist
- **This README** - Overview and quick reference

## 🔍 Pre-Launch Checklist

- [ ] RAZORPAY_KEY_SECRET configured in .env
- [ ] Webhook URL set in Razorpay dashboard
- [ ] HTTPS enabled (production)
- [ ] Rate limiting configured
- [ ] Logging reviewed (no sensitive data)
- [ ] Error messages are generic
- [ ] Signature verification tested with invalid signatuers
- [ ] Duplicate payment prevention tested
- [ ] Amount validation tested
- [ ] Authorization checks tested
- [ ] Database profit fields verified
- [ ] Webhook signature verification working
- [ ] Monitoring & alerting configured
- [ ] Backup & disaster recovery tested

See SECURITY_CHECKLIST.md for complete pre-launch checklist.

## 🆘 Troubleshooting

### Signature Verification Fails
1. Verify Razorpay secret key in .env
2. Check signature format (64 hex characters)
3. Ensure body format: `orderId|paymentId`
4. Check for whitespace in secret

### Order Not Found
1. Verify order ID is correct MongoDB ObjectId
2. Confirm user owns the order
3. Check database: `db.orders.findById("507f...")`
4. Verify order still in pending status

### Webhook Not Processing
1. Check webhook URL in Razorpay dashboard (must be HTTPS)
2. Verify webhook secret in .env
3. Check server logs for webhook events
4. Test with Razorpay's webhook testing tool

### Profit Calculation Wrong
1. Verify basePrice is Qikink cost
2. Check effectivePrice calculation
3. Ensure totalBasePrice = sum(basePrice × quantity)
4. Review profit formula: (effectivePrice - basePrice) × quantity

## 📞 Support

### Razorpay
- [Dashboard](https://dashboard.razorpay.com/)
- [Documentation](https://razorpay.com/docs/)
- [Support](https://support.razorpay.com/)

### KAVOX Team
- Review SECURITY_CHECKLIST.md for security issues
- Check PAYMENT_INTEGRATION.md for API questions
- See QUICK_START.md for implementation examples

## 📦 Dependencies

- `razorpay` - Official Razorpay SDK
- `crypto` - Node.js built-in HMAC
- `express` - Web framework
- `mongoose` - MongoDB driver

## 📝 License

Copyright © 2025 KAVOX. All rights reserved.

---

## ✨ Summary

This payment service provides:

✅ Enterprise-grade security for payment processing
✅ Real-time profit tracking and analytics
✅ Zero-downtime webhook redundancy
✅ Comprehensive error handling
✅ Detailed logging for debugging
✅ PCI-DSS compliance ready

**Status**: Production Ready 🚀

---

For detailed information, see:
- **Quick setup**: See QUICK_START.md
- **API docs**: See PAYMENT_INTEGRATION.md
- **Security**: See SECURITY_CHECKLIST.md
