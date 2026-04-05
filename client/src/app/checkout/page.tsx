'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, CreditCard, Truck, ChevronRight, Plus, Check } from 'lucide-react';
import { useAppDispatch, useAppSelector, useToast, useRequireAuth } from '@/hooks';
import { selectCartItems, selectCartTotal, clearCart } from '@/store/slices/cartSlice';
import { orderApi, paymentApi, getErrorMessage } from '@/lib/api';

declare global { interface Window { Razorpay: any; } }

const STEPS = ['Address', 'Order Summary', 'Payment'];

export default function CheckoutPage() {
  useRequireAuth();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const toast = useToast();
  const items = useAppSelector(selectCartItems);
  const subtotal = useAppSelector(selectCartTotal);
  const { user } = useAppSelector(s => s.auth);

  const [step, setStep] = useState(0);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'cod'>('razorpay');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({ fullName: '', phone: '', addressLine1: '', addressLine2: '', city: '', state: '', pincode: '', country: 'India' });

  const shipping = subtotal >= 499 ? 0 : 49;
  const gst = Math.round(subtotal * 0.12);
  const total = subtotal + shipping + gst;

  useEffect(() => {
    if (user?.addresses?.length && !selectedAddress) {
      const def = user.addresses.find(a => a.isDefault) || user.addresses[0];
      if (def) setSelectedAddress(def._id);
    }
  }, [user]);

  useEffect(() => {
    if (items.length === 0 && !placingOrder) router.push('/cart');
  }, [items.length]);

  // Load Razorpay script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  const getShippingAddress = () => {
    if (!selectedAddress || !user?.addresses) return null;
    return user.addresses.find(a => a._id === selectedAddress);
  };

  const handlePlaceOrder = async () => {
    const addr = getShippingAddress();
    if (!addr) { toast.error('Please select a delivery address'); return; }
    if (items.length === 0) { toast.error('Your cart is empty'); return; }

    setPlacingOrder(true);
    try {
      // 1. Place order
      const orderPayload = {
        items: items.map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          variantId: i.variant?.variantId,
        })),
        shippingAddress: { fullName: addr.fullName, phone: addr.phone, addressLine1: addr.addressLine1, addressLine2: addr.addressLine2, city: addr.city, state: addr.state, pincode: addr.pincode, country: addr.country },
        paymentMethod,
      };

      const { data: orderData } = await orderApi.placeOrder(orderPayload);
      const order = orderData.data.order;

      if (paymentMethod === 'cod') {
        dispatch(clearCart());
        toast.success('Order placed! Pay on delivery.');
        router.push(`/orders/${order._id}?success=true`);
        return;
      }

      // 2. Create Razorpay order
      const { data: rpData } = await paymentApi.createRazorpayOrder(order._id);
      const { razorpayOrderId, amount, currency, keyId } = rpData.data;

      // 3. Open Razorpay modal
      const options = {
        key: keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount,
        currency,
        name: 'KAVOX',
        description: `Order #${order.orderNumber}`,
        order_id: razorpayOrderId,
        prefill: { name: user?.firstName + ' ' + user?.lastName, email: user?.email, contact: user?.phone || '' },
        theme: { color: '#C8956C' },
        handler: async (response: any) => {
          try {
            const { data: verifyData } = await paymentApi.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              orderId: order._id,
            });
            dispatch(clearCart());
            toast.success('Payment successful! Order confirmed.');
            router.push(`/orders/${order._id}?success=true`);
          } catch (e) {
            toast.error('Payment verification failed. Contact support.');
          }
        },
        modal: {
          ondismiss: () => {
            toast.info('Payment cancelled. Your order is saved.');
            router.push(`/orders/${order._id}`);
          },
        },
      };

      if (!window.Razorpay) { toast.error('Payment gateway not loaded. Please refresh.'); setPlacingOrder(false); return; }
      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setPlacingOrder(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-kavox-cream">
      {/* Header */}
      <div className="bg-white border-b border-kavox-border py-4">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="flex items-center justify-between">
            <span className="font-display text-2xl font-bold text-kavox-black">KAVOX</span>
            {/* Step indicator */}
            <div className="flex items-center gap-2">
              {STEPS.map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${i <= step ? 'text-kavox-black' : 'text-kavox-silver'}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${i < step ? 'bg-green-500 text-white' : i === step ? 'bg-kavox-black text-white' : 'bg-kavox-tan text-kavox-gray'}`}>
                      {i < step ? <Check className="w-3 h-3" /> : i + 1}
                    </div>
                    <span className="hidden sm:block">{s}</span>
                  </div>
                  {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-kavox-tan" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-8">
        <div className="grid lg:grid-cols-[1fr_400px] gap-8 items-start">

          {/* Left: Main */}
          <div className="space-y-5">

            {/* Address Section */}
            <div className="bg-white rounded-sm border border-kavox-border overflow-hidden">
              <div className="px-6 py-4 border-b border-kavox-border flex items-center gap-3">
                <div className="w-8 h-8 bg-kavox-accent-light rounded-full flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-kavox-accent" />
                </div>
                <h2 className="font-bold text-kavox-black">Delivery Address</h2>
              </div>

              <div className="p-6">
                {user.addresses.length === 0 ? (
                  <p className="text-sm text-kavox-gray mb-4 font-light">No addresses saved. Add one below.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3 mb-4">
                    {user.addresses.map(addr => (
                      <button
                        key={addr._id}
                        onClick={() => setSelectedAddress(addr._id)}
                        className={`text-left p-4 border-2 rounded-sm transition-all duration-200 ${selectedAddress === addr._id ? 'border-kavox-black bg-kavox-cream' : 'border-kavox-border hover:border-kavox-tan'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-kavox-black">{addr.fullName}</p>
                            <p className="text-xs text-kavox-gray mt-1 font-light leading-relaxed">
                              {addr.addressLine1}{addr.addressLine2 && `, ${addr.addressLine2}`}<br />
                              {addr.city}, {addr.state} {addr.pincode}
                            </p>
                            <p className="text-xs text-kavox-gray mt-1">{addr.phone}</p>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${selectedAddress === addr._id ? 'border-kavox-black bg-kavox-black' : 'border-kavox-border'}`}>
                            {selectedAddress === addr._id && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                        </div>
                        {addr.isDefault && <span className="badge-accent text-[10px] mt-2">Default</span>}
                      </button>
                    ))}
                  </div>
                )}

                <button onClick={() => setShowAddAddress(!showAddAddress)} className="flex items-center gap-2 text-sm font-semibold text-kavox-accent hover:text-kavox-accent-dark transition-colors">
                  <Plus className="w-4 h-4" /> Add New Address
                </button>

                {showAddAddress && (
                  <div className="mt-4 p-4 bg-kavox-cream rounded-sm border border-kavox-border grid grid-cols-2 gap-3">
                    {[
                      { label: 'Full Name', key: 'fullName', colSpan: true },
                      { label: 'Phone', key: 'phone', colSpan: false },
                      { label: 'Address Line 1', key: 'addressLine1', colSpan: true },
                      { label: 'Address Line 2 (Optional)', key: 'addressLine2', colSpan: true },
                      { label: 'City', key: 'city', colSpan: false },
                      { label: 'State', key: 'state', colSpan: false },
                      { label: 'Pincode', key: 'pincode', colSpan: false },
                    ].map(field => (
                      <div key={field.key} className={field.colSpan ? 'col-span-2' : ''}>
                        <label className="label">{field.label}</label>
                        <input
                          className="input"
                          value={(newAddress as any)[field.key]}
                          onChange={e => setNewAddress(prev => ({ ...prev, [field.key]: e.target.value }))}
                          placeholder={field.label}
                        />
                      </div>
                    ))}
                    <div className="col-span-2">
                      <button onClick={() => setShowAddAddress(false)} className="btn-primary btn-sm">Save Address</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Method */}
            <div className="bg-white rounded-sm border border-kavox-border overflow-hidden">
              <div className="px-6 py-4 border-b border-kavox-border flex items-center gap-3">
                <div className="w-8 h-8 bg-kavox-accent-light rounded-full flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-kavox-accent" />
                </div>
                <h2 className="font-bold text-kavox-black">Payment Method</h2>
              </div>
              <div className="p-6 space-y-3">
                {[
                  { value: 'razorpay', label: 'Online Payment', sub: 'UPI, Cards, Net Banking, Wallets via Razorpay', icon: '💳' },
                  { value: 'cod', label: 'Cash on Delivery', sub: 'Pay when your order arrives', icon: '💵' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setPaymentMethod(opt.value as any)}
                    className={`w-full flex items-center gap-4 p-4 border-2 rounded-sm text-left transition-all duration-200 ${paymentMethod === opt.value ? 'border-kavox-black bg-kavox-cream' : 'border-kavox-border hover:border-kavox-tan'}`}
                  >
                    <span className="text-2xl">{opt.icon}</span>
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-kavox-black">{opt.label}</p>
                      <p className="text-xs text-kavox-gray font-light">{opt.sub}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${paymentMethod === opt.value ? 'border-kavox-black bg-kavox-black' : 'border-kavox-border'}`}>
                      {paymentMethod === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Order Summary */}
          <div className="lg:sticky lg:top-24 space-y-4">
            <div className="bg-white rounded-sm border border-kavox-border overflow-hidden">
              <div className="px-6 py-4 border-b border-kavox-border">
                <h2 className="font-bold text-kavox-black">Order Summary ({items.length} items)</h2>
              </div>

              {/* Items */}
              <div className="px-6 py-4 space-y-4 max-h-64 overflow-y-auto">
                {items.map(item => (
                  <div key={item.id} className="flex gap-3">
                    <div className="w-14 h-16 bg-kavox-sand rounded flex-shrink-0 overflow-hidden">
                      <img src={item.image || '/placeholder.jpg'} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-kavox-black line-clamp-1">{item.name}</p>
                      {(item.variant?.size || item.variant?.color?.name) && (
                        <p className="text-xs text-kavox-gray mt-0.5">{[item.variant.size, item.variant.color?.name].filter(Boolean).join(' / ')}</p>
                      )}
                      <p className="text-xs text-kavox-gray mt-0.5">Qty: {item.quantity}</p>
                    </div>
                    <span className="text-sm font-bold text-kavox-black flex-shrink-0">₹{(item.price * item.quantity).toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>

              {/* Price breakdown */}
              <div className="px-6 py-4 border-t border-kavox-border space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-kavox-gray font-light">Subtotal</span>
                  <span className="font-medium">₹{subtotal.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-kavox-gray font-light">Shipping</span>
                  <span className={shipping === 0 ? 'text-green-600 font-semibold' : 'font-medium'}>
                    {shipping === 0 ? 'FREE' : `₹${shipping}`}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-kavox-gray font-light">GST (12%)</span>
                  <span className="font-medium">₹{gst.toLocaleString('en-IN')}</span>
                </div>
                <div className="divider" />
                <div className="flex justify-between">
                  <span className="font-bold text-kavox-black">Total</span>
                  <span className="font-bold text-xl text-kavox-black">₹{total.toLocaleString('en-IN')}</span>
                </div>
              </div>

              {/* CTA */}
              <div className="px-6 pb-6">
                <button
                  onClick={handlePlaceOrder}
                  disabled={placingOrder || !selectedAddress}
                  className="btn-primary w-full py-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {placingOrder ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing…
                    </span>
                  ) : paymentMethod === 'cod' ? (
                    <>Place Order (COD) <Truck className="w-4 h-4" /></>
                  ) : (
                    <>Pay ₹{total.toLocaleString('en-IN')} <CreditCard className="w-4 h-4" /></>
                  )}
                </button>
                <p className="text-center text-xs text-kavox-gray mt-3 font-light">🔒 Secured by Razorpay. Your data is safe.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
