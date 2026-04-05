'use strict';

/**
 * DESIGN SYSTEM INTEGRATION EXAMPLES
 * ──────────────────────────────────
 * Reference implementation for integrating custom designs with order flow
 * 
 * 1. UPLOAD CUSTOM DESIGN (Frontend → Backend)
 * 2. CREATE ORDER WITH DESIGN
 * 3. SEND TO QIKINK WITH DESIGN DATA
 */

// ═══════════════════════════════════════════════════════════════
// 1. UPLOAD CUSTOM DESIGN
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/v1/designs
 * Body: multipart/form-data
 * 
 * Fields:
 *   - file: image file (PNG/JPG, max 10MB)
 *   - name: design name (optional)
 *   - productId: product to use design on
 *   - selectedSize: XS, S, M, L, XL, XXL, 3XL
 *   - selectedColor: { name: "White", hexCode: "#FFFFFF" }
 *   - printArea: front, back, left-sleeve, right-sleeve, front-back
 *   - textLayers: JSON (optional text overlays)
 *   - canvasState: JSON (optional canvas state)
 * 
 * Response: 
 * {
 *   "success": true,
 *   "message": "Design uploaded and saved",
 *   "data": {
 *     "design": {
 *       "_id": "design_id",
 *       "designImageUrl": "https://res.cloudinary.com/...",
 *       "status": "draft",
 *       "selectedSize": "M",
 *       "printArea": "front"
 *     }
 *   }
 * }*/

// ═══════════════════════════════════════════════════════════════
// 2. GET PRODUCT DESIGN OPTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/v1/designs/product/:productId/config
 * 
 * Returns available options for designing on a product:
 * {
 *   "success": true,
 *   "data": {
 *     "printAreas": ["front", "back", "left-sleeve", "right-sleeve"],
 *     "colors": [
 *       { "name": "White", "hexCode": "#FFFFFF" },
 *       { "name": "Black", "hexCode": "#000000" },
 *       { "name": "Red", "hexCode": "#FF0000" }
 *     ],
 *     "sizes": ["XS", "S", "M", "L", "XL", "XXL", "3XL"]
 *   }
 * }*/

// ═══════════════════════════════════════════════════════════════
// 3. UPDATE DESIGN (modify before ordering)
// ═══════════════════════════════════════════════════════════════

/**
 * PATCH /api/v1/designs/:designId
 * Body: {
 *   "name": "My Custom Tee",
 *   "selectedSize": "L",
 *   "selectedColor": { "name": "Navy", "hexCode": "#000080" },
 *   "printArea": "front",
 *   "textLayers": [
 *     {
 *       "content": "Hello World",
 *       "fontFamily": "Arial",
 *       "fontSize": 48,
 *       "color": "#FFFFFF",
 *       "positionX": 50,
 *       "positionY": 50
 *     }
 *   ],
 *   "status": "ready"
 * }*/

// ═══════════════════════════════════════════════════════════════
// 4. CREATE ORDER WITH CUSTOM DESIGN
// ═══════════════════════════════════════════════════════════════

/**
 * Example: In your order service, when creating an order:
 * 
 * const designOrderIntegration = require('../design-order.integration');
 * 
 * if (req.body.designId) {
 *   // Validate design
 *   const validation = await designOrderIntegration.validateDesignForOrder(
 *     req.body.designId,
 *     req.user._id
 *   );
 * 
 *   if (!validation.valid) {
 *     return res.status(400).json({ error: validation.error });
 *   }
 * 
 *   // Create order normally
 *   const order = await Order.create(orderData);
 * 
 *   // Link design to order
 *   await designOrderIntegration.addDesignToOrder(
 *     order._id,
 *     req.body.designId,
 *     req.user._id
 *   );
 * }*/

// ═══════════════════════════════════════════════════════════════
// 5. SEND CUSTOM DESIGN TO QIKINK
// ═══════════════════════════════════════════════════════════════

/**
 * When submitting order to Qikink API:
 * 
 * const designOrderIntegration = require('../design-order.integration');
 * 
 * const qikinkPayload = {
 *   items: [...],
 *   shipping_address: {...}
 * };
 * 
 * if (order.customDesign) {
 *   // Get Qikink design format
 *   const designPayload = await designOrderIntegration.getQikinkDesignPayload(order);
 *   qikinkPayload.custom_design = designPayload;
 * 
 *   // Include in items
 *   qikinkPayload.items.forEach(item => {
 *     item.design_id = designPayload.design_id;
 *     item.print_area = designPayload.print_area;
 *     item.color = designPayload.color;
 *     item.size = designPayload.size;
 *   });
 * }
 * 
 * // Send to Qikink
 * const response = await axios.post(
 *   `${QIKINK_API}/v2/orders`,
 *   qikinkPayload,
 *   { headers: { Authorization: `Bearer ${QIKINK_KEY}` } }
 * );*/

// ═══════════════════════════════════════════════════════════════
// 6. LINK DESIGN TO EXISTING ORDER
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/v1/designs/:designId/link-to-order
 * Body: {
 *   "orderId": "order_id"
 * }
 * 
 * Use this if user adds design to order after creation
 * (for future design modifications during checkout)*/

// ═══════════════════════════════════════════════════════════════
// 7. COPY DESIGN FROM PREVIOUS ORDER
// ═══════════════════════════════════════════════════════════════

/**
 * Example: User wants to reuse design from previous order
 * 
 * const designOrderIntegration = require('../design-order.integration');
 * 
 * const newDesign = await designOrderIntegration.copyOrderDesignToNew(
 *   orderId,
 *   userId,
 *   'My Design - Reorder'
 * );
 * 
 * Returns new design in "draft" status ready for modification*/

// ═══════════════════════════════════════════════════════════════
// 8. GET USER DESIGN STATS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/v1/designs/stats
 * 
 * Returns:
 * {
 *   "success": true,
 *   "data": {
 *     "stats": {
 *       "totalDesigns": 5,
 *       "draftDesigns": 1,
 *       "readyDesigns": 2,
 *       "orderedDesigns": 2,
 *       "uploadedToQikink": 4,
 *       "readyForOrder": 4
 *     }
 *   }
 * }*/

// ═══════════════════════════════════════════════════════════════
// 9. DATABASE SCHEMA (Order with Design)
// ═══════════════════════════════════════════════════════════════

/**
 * Order document with custom design field:
 * 
 * {
 *   "_id": "order_id",
 *   "orderNumber": "KVX260405XXXXX",
 *   "user": "user_id",
 *   "customDesign": {
 *     "designId": "design_id",
 *     "qikinkDesignId": "qikink_design_123",
 *     "imageUrl": "https://res.cloudinary.com/...",
 *     "printArea": "front",
 *     "selectedColor": { "name": "Black", "hexCode": "#000000" },
 *     "selectedSize": "M",
 *     "textLayers": [
 *       {
 *         "content": "My Text",
 *         "fontFamily": "Arial",
 *         "color": "#FFFFFF"
 *       }
 *     ]
 *   },
 *   "items": [...],
 *   "status": "confirmed",
 *   "paymentStatus": "paid"
 * }*/

// ═══════════════════════════════════════════════════════════════
// 10. INTEGRATION CHECKLIST
// ═══════════════════════════════════════════════════════════════

/**
 * ✅ Design Model (Design.js)
 *    - Stores design metadata, image URLs, text layers
 *    - Links to user, product, and Qikink
 *    - Tracks upload status
 * 
 * ✅ Design Service (design.service.js)
 *    - CRUD operations
 *    - Cloudinary integration
 *    - Qikink upload
 *    - Order linking
 * 
 * ✅ Design Controller (designController.js)
 *    - Route handlers
 *    - File upload handling
 *    - Response formatting
 * 
 * ✅ Design Routes (designRoutes.js)
 *    - 10+ endpoints
 *    - Multer file upload
 *    - Authentication
 * 
 * ✅ Order Integration (design-order.integration.js)
 *    - Adding design to orders
 *    - Qikink payload formatting
 *    - Design validation
 *    - Copy design from order
 * 
 * ✅ Order Model Update
 *    - Added customDesign field
 *    - Stores design reference + metadata
 * 
 * 🔄 TODO: In your order service:
 *    - Import designOrderIntegration
 *    - Add design validation in checkout
 *    - Include design in Qikink order submission
 *    - Handle design cleanup on order cancellation
 * 
 * 🔄 TODO: Environment Variables
 *    - CLOUDINARY_CLOUD_NAME
 *    - CLOUDINARY_API_KEY
 *    - CLOUDINARY_API_SECRET
 *    - QIKINK_BASE_URL
 *    - QIKINK_API_KEY*/

// ═══════════════════════════════════════════════════════════════
// API ENDPOINTS SUMMARY
// ═══════════════════════════════════════════════════════════════

/**
 * 
 * DESIGN CRUD:
 *   POST   /api/v1/designs                      - Create design (upload image)
 *   GET    /api/v1/designs                      - List user's designs
 *   GET    /api/v1/designs/:id                  - Get single design
 *   PATCH  /api/v1/designs/:id                  - Update design
 *   DELETE /api/v1/designs/:id                  - Delete design
 * 
 * DESIGN CONFIGURATION:
 *   GET    /api/v1/designs/product/:productId/config - Get product design options
 *   GET    /api/v1/designs/stats                     - Get design statistics
 * 
 * QIKINK INTEGRATION:
 *   POST   /api/v1/designs/:id/upload-to-qikink     - Upload design to Qikink
 *   POST   /api/v1/designs/:id/preview              - Generate preview/mockup
 * 
 * ORDER INTEGRATION:
 *   POST   /api/v1/designs/:id/link-to-order        - Link design to order
 * 
 * AUTHENTICATION:
 *   - All endpoints require user login (protect middleware)
 *   - User can only access/modify their own designs
 *   - Design ownership verified on every operation
 * 
 * FILE UPLOAD:
 *   - Multer integration with Cloudinary
 *   - Supported formats: JPG, PNG, WebP, GIF
 *   - Max file size: 10MB
 *   - Auto-transforms for quality/format optimization
 */

module.exports = {
  // Reference implementation - not used, just documentation
  description: 'Design system integration guide',
};
