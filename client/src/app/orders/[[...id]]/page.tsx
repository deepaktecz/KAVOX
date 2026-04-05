'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Package, Truck, CheckCircle, XCircle, RotateCcw, ChevronRight, MapPin, Clock, Bell } from 'lucide-react';
import { useAppSelector, useRequireAuth, useToast, useOrderTracking } from '@/hooks';
import { orderApi, getErrorMessage } from '@/lib/api';

// ─────────────────────────────────────────────────
// STATUS config
// ─────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any; step: number }> = {
  pending_payment: { label: 'Awaiting Payment', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: Clock, step: 0 },
  confirmed:       { label: 'Confirmed',         color: 'text-blue-600 bg-blue-50 border-blue-200',   icon: CheckCircle, step: 1 },
  processing:      { label: 'Processing',         color: 'text-purple-600 bg-purple-50 border-purple-200', icon: Package, step: 2 },
  packed:          { label: 'Packed',             color: 'text-indigo-600 bg-indigo-50 border-indigo-200', icon: Package, step: 3 },
  shipped:         { label: 'Shipped',            color: 'text-indigo-600 bg-indigo-50 border-indigo-200', icon: Truck, step: 4 },
  out_for_delivery:{ label: 'Out for Delivery',   color: 'text-orange-600 bg-orange-50 border-orange-200', icon: Truck, step: 5 },
  delivered:       { label: 'Delivered',          color: 'text-green-600 bg-green-50 border-green-200', icon: CheckCircle, step: 6 },
  cancelled:       { label: 'Cancelled',          color: 'text-red-600 bg-red-50 border-red-200',    icon: XCircle, step: -1 },
  return_requested:{ label: 'Return Requested',   color: 'text-amber-600 bg-amber-50 border-amber-200', icon: RotateCcw, step: -1 },
  returned:        { label: 'Returned',           color: 'text-gray-600 bg-gray-50 border-gray-200', icon: RotateCcw, step: -1 },
};

const PROGRESS_STEPS = ['Confirmed', 'Processing', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered'];

// ─────────────────────────────────────────────────
// MY ORDERS LIST
// ─────────────────────────────────────────────────
export default function OrdersPage() {
  useRequireAuth();
  const toast = useToast();
  const params = useParams();
  const searchParams = useSearchParams();
  const isSuccess = searchParams.get('success') === 'true';

  const orderId = params?.id as string | undefined;

  if (orderId) return <OrderDetail orderId={orderId} />;

  return <OrdersList />;
}

function OrdersList() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const toast = useToast();

  useEffect(() => {
    loadOrders();
  }, [filter]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const params: any = { limit: 20 };
      if (filter !== 'all') params.status = filter;
      const { data } = await orderApi.getMyOrders(params);
      setOrders(data.data.orders || []);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const STATUS_FILTERS = [
    { label: 'All', value: 'all' },
    { label: 'Active', value: 'confirmed' },
    { label: 'Shipped', value: 'shipped' },
    { label: 'Delivered', value: 'delivered' },
    { label: 'Cancelled', value: 'cancelled' },
  ];

  return (
    <div className="min-h-screen bg-kavox-cream">
      <div className="bg-white border-b border-kavox-border">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-6">
          <h1 className="text-2xl font-bold text-kavox-black">My Orders</h1>
          <p className="text-sm text-kavox-gray font-light mt-1">Track and manage your KAVOX orders</p>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-8">
        {/* Filter tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide pb-1">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-4 py-2 text-sm font-semibold rounded-sm whitespace-nowrap border transition-all duration-200 flex-shrink-0 ${filter === f.value ? 'bg-kavox-black text-white border-kavox-black' : 'bg-white text-kavox-gray border-kavox-border hover:border-kavox-charcoal'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Orders list */}
        {loading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => <div key={i} className="skeleton h-32 rounded-sm" />)}
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-sm border border-kavox-border">
            <Package className="w-16 h-16 text-kavox-tan mx-auto mb-4" />
            <h3 className="text-xl font-bold text-kavox-charcoal mb-2">No orders yet</h3>
            <p className="text-kavox-gray mb-6 font-light">Your orders will appear here once you shop</p>
            <Link href="/shop" className="btn-primary">Start Shopping</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map(order => {
              const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.confirmed;
              const Icon = cfg.icon;
              return (
                <Link
                  key={order._id}
                  href={`/orders/${order._id}`}
                  className="block bg-white rounded-sm border border-kavox-border hover:border-kavox-tan hover:shadow-kavox-sm transition-all duration-200 overflow-hidden"
                >
                  {/* Order header */}
                  <div className="flex items-center justify-between px-5 py-3.5 bg-kavox-cream border-b border-kavox-border">
                    <div className="flex items-center gap-4 text-xs">
                      <div>
                        <span className="text-kavox-gray font-light">Order </span>
                        <span className="font-bold text-kavox-black font-mono">#{order.orderNumber}</span>
                      </div>
                      <div className="hidden sm:block text-kavox-gray font-light">
                        {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`status-chip border text-xs ${cfg.color}`}>
                        <Icon className="w-3 h-3" />{cfg.label}
                      </span>
                      <ChevronRight className="w-4 h-4 text-kavox-silver" />
                    </div>
                  </div>

                  {/* Items preview */}
                  <div className="flex items-center gap-4 px-5 py-4">
                    <div className="flex -space-x-2">
                      {order.items?.slice(0, 3).map((item: any, i: number) => (
                        <div key={i} className="w-12 h-14 rounded border-2 border-white bg-kavox-sand overflow-hidden flex-shrink-0">
                          <img src={item.image || '/placeholder.jpg'} alt={item.name} className="w-full h-full object-cover" />
                        </div>
                      ))}
                      {order.items?.length > 3 && (
                        <div className="w-12 h-14 rounded border-2 border-white bg-kavox-sand flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-kavox-gray">+{order.items.length - 3}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-kavox-black line-clamp-1">
                        {order.items?.[0]?.name}{order.items?.length > 1 ? ` + ${order.items.length - 1} more` : ''}
                      </p>
                      <p className="text-xs text-kavox-gray mt-0.5 font-light">{order.items?.length} item{order.items?.length > 1 ? 's' : ''}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-base font-bold text-kavox-black">₹{order.totalAmount?.toLocaleString('en-IN')}</p>
                      <p className="text-xs text-kavox-gray font-light capitalize">{order.paymentMethod?.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// ORDER DETAIL with real-time Socket.io tracking
// ─────────────────────────────────────────────────
function OrderDetail({ orderId }: { orderId: string }) {
  const { user } = useAppSelector(s => s.auth);
  const toast = useToast();
  const searchParams = useSearchParams();
  const isSuccess = searchParams.get('success') === 'true';

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  // Feature 5: Real-time order tracking via Socket.io hook
  const { status: liveStatus, lastEvent } = useOrderTracking(orderId);

  useEffect(() => {
    loadOrder();
    if (isSuccess) toast.success('🎉 Order placed successfully!');
  }, [orderId]);

  // Reflect live socket status into local order state
  useEffect(() => {
    if (!liveStatus || !order) return;
    if (liveStatus !== order.status) {
      setOrder((prev: any) => prev ? { ...prev, status: liveStatus } : prev);
      toast.info(`Order status updated: ${liveStatus.replace(/_/g, ' ')}`);
    }
  }, [liveStatus, lastEvent]);

  const loadOrder = async () => {
    try {
      const { data } = await orderApi.getOrder(orderId);
      setOrder(data.data.order);
    } catch (e) {
      toast.error('Order not found');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this order?')) return;
    setCancelling(true);
    try {
      await orderApi.cancelOrder(orderId, { reason: 'Customer request' });
      toast.success('Order cancelled');
      loadOrder();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setCancelling(false); }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-4">
        {[1,2,3,4].map(i => <div key={i} className="skeleton h-24 rounded-sm" />)}
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-bold text-kavox-charcoal mb-4">Order not found</h2>
        <Link href="/orders" className="btn-primary">Back to Orders</Link>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.confirmed;
  const StatusIcon = cfg.icon;
  const currentStep = cfg.step;
  const canCancel = ['pending_payment', 'confirmed', 'processing'].includes(order.status);
  const canReturn = order.status === 'delivered' && order.deliveredAt &&
    (Date.now() - new Date(order.deliveredAt).getTime()) < 7 * 86400000;

  return (
    <div className="min-h-screen bg-kavox-cream">
      {/* Live update banner */}
      {liveStatus && (
        <div className="bg-blue-600 text-white text-sm font-medium py-3 text-center flex items-center justify-center gap-2">
          <Bell className="w-4 h-4 animate-pulse" />
          Live update: Order is now "{liveStatus.replace(/_/g, ' ')}"
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/orders" className="text-sm text-kavox-gray hover:text-kavox-black flex items-center gap-1.5 font-medium transition-colors">
            ← Back to Orders
          </Link>
        </div>

        {/* Order header card */}
        <div className="bg-white rounded-sm border border-kavox-border overflow-hidden mb-5">
          <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-lg font-bold text-kavox-black font-mono">#{order.orderNumber}</h1>
                <span className={`status-chip border text-xs ${cfg.color}`}>
                  <StatusIcon className="w-3 h-3" />{cfg.label}
                </span>
              </div>
              <p className="text-sm text-kavox-gray font-light">
                Placed on {new Date(order.createdAt).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              {order.estimatedDelivery && order.status !== 'delivered' && (
                <p className="text-sm text-kavox-accent font-semibold mt-1">
                  Est. delivery: {new Date(order.estimatedDelivery).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </p>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {canCancel && (
                <button onClick={handleCancel} disabled={cancelling} className="btn-secondary btn-sm text-red-500 border-red-200 hover:bg-red-50">
                  {cancelling ? 'Cancelling...' : 'Cancel Order'}
                </button>
              )}
              {canReturn && (
                <button className="btn-secondary btn-sm">Request Return</button>
              )}
            </div>
          </div>

          {/* Progress tracker */}
          {currentStep >= 0 && (
            <div className="px-6 pb-6">
              <div className="relative">
                {/* Track line */}
                <div className="absolute top-4 left-4 right-4 h-0.5 bg-kavox-border">
                  <div
                    className="h-full bg-kavox-accent transition-all duration-700"
                    style={{ width: currentStep > 0 ? `${Math.min(((currentStep - 1) / (PROGRESS_STEPS.length - 1)) * 100, 100)}%` : '0%' }}
                  />
                </div>
                <div className="relative flex justify-between">
                  {PROGRESS_STEPS.map((step, i) => {
                    const isCompleted = currentStep > i;
                    const isCurrent = currentStep === i + 1;
                    return (
                      <div key={step} className="flex flex-col items-center gap-2">
                        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center z-10 transition-all duration-300 ${isCompleted ? 'bg-kavox-accent border-kavox-accent text-white' : isCurrent ? 'bg-white border-kavox-accent' : 'bg-white border-kavox-border'}`}>
                          {isCompleted ? <CheckCircle className="w-4 h-4" /> : (
                            <span className={`text-xs font-bold ${isCurrent ? 'text-kavox-accent' : 'text-kavox-silver'}`}>{i + 1}</span>
                          )}
                        </div>
                        <span className={`text-[10px] text-center font-medium leading-tight max-w-[60px] ${isCompleted || isCurrent ? 'text-kavox-charcoal' : 'text-kavox-silver'}`}>{step}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-[1fr_320px] gap-5">
          {/* Left column */}
          <div className="space-y-5">
            {/* Items */}
            <div className="bg-white rounded-sm border border-kavox-border overflow-hidden">
              <div className="px-5 py-4 border-b border-kavox-border">
                <h2 className="font-bold text-kavox-black text-sm uppercase tracking-wider">Items Ordered</h2>
              </div>
              <div className="divide-y divide-kavox-border">
                {order.items?.map((item: any) => (
                  <div key={item._id} className="flex gap-4 p-4">
                    <div className="w-16 h-20 bg-kavox-sand rounded flex-shrink-0 overflow-hidden">
                      <img src={item.image || '/placeholder.jpg'} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-kavox-black line-clamp-2">{item.name}</p>
                      {(item.variant?.size || item.variant?.color?.name) && (
                        <p className="text-xs text-kavox-gray mt-1">{[item.variant.size, item.variant.color?.name].filter(Boolean).join(' / ')}</p>
                      )}
                      <p className="text-xs text-kavox-gray mt-0.5 font-light">Qty: {item.quantity}</p>
                      <p className="text-sm font-bold text-kavox-black mt-1">₹{item.effectivePrice?.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-kavox-black">₹{item.totalItemPrice?.toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tracking timeline */}
            {order.trackingEvents?.length > 0 && (
              <div className="bg-white rounded-sm border border-kavox-border overflow-hidden">
                <div className="px-5 py-4 border-b border-kavox-border flex items-center justify-between">
                  <h2 className="font-bold text-kavox-black text-sm uppercase tracking-wider">Tracking History</h2>
                  {order.trackingNumber && (
                    <span className="text-xs font-mono text-kavox-accent bg-kavox-accent-light px-2 py-1 rounded">
                      {order.courierName || 'Courier'}: {order.trackingNumber}
                    </span>
                  )}
                </div>
                <div className="p-5">
                  <div className="relative space-y-4">
                    {[...order.trackingEvents].reverse().map((event: any, i: number) => (
                      <div key={i} className="flex gap-4 relative">
                        {i < order.trackingEvents.length - 1 && (
                          <div className="absolute left-3 top-6 bottom-0 w-px bg-kavox-border" />
                        )}
                        <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center z-10 mt-0.5 ${i === 0 ? 'bg-kavox-accent' : 'bg-kavox-border'}`}>
                          <div className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-white' : 'bg-kavox-silver'}`} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-kavox-charcoal capitalize">{event.status?.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-kavox-gray font-light">{event.message}</p>
                          {event.location && <p className="text-xs text-kavox-accent font-medium"><MapPin className="w-3 h-3 inline mr-1" />{event.location}</p>}
                          <p className="text-xs text-kavox-silver mt-0.5">
                            {new Date(event.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-5">
            {/* Price summary */}
            <div className="bg-white rounded-sm border border-kavox-border p-5">
              <h2 className="font-bold text-kavox-black text-sm uppercase tracking-wider mb-4">Order Summary</h2>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between"><span className="text-kavox-gray font-light">Subtotal</span><span>₹{order.subtotal?.toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between"><span className="text-kavox-gray font-light">Shipping</span><span className={order.shippingCharge === 0 ? 'text-green-600 font-semibold' : ''}>{order.shippingCharge === 0 ? 'FREE' : `₹${order.shippingCharge}`}</span></div>
                <div className="flex justify-between"><span className="text-kavox-gray font-light">GST</span><span>₹{order.gstTotal?.toLocaleString('en-IN')}</span></div>
                {order.couponDiscount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>-₹{order.couponDiscount}</span></div>}
                <div className="divider" />
                <div className="flex justify-between font-bold text-kavox-black text-base"><span>Total</span><span>₹{order.totalAmount?.toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between text-xs">
                  <span className="text-kavox-gray font-light">Payment</span>
                  <span className={`font-semibold capitalize ${order.paymentStatus === 'paid' ? 'text-green-600' : order.paymentStatus === 'pending' ? 'text-amber-600' : 'text-red-500'}`}>
                    {order.paymentStatus} · {order.paymentMethod?.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            </div>

            {/* Shipping address */}
            {order.shippingAddress && (
              <div className="bg-white rounded-sm border border-kavox-border p-5">
                <h2 className="font-bold text-kavox-black text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-kavox-accent" /> Delivery Address
                </h2>
                <div className="text-sm text-kavox-gray font-light leading-relaxed">
                  <p className="font-semibold text-kavox-charcoal">{order.shippingAddress.fullName}</p>
                  <p>{order.shippingAddress.addressLine1}</p>
                  {order.shippingAddress.addressLine2 && <p>{order.shippingAddress.addressLine2}</p>}
                  <p>{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.pincode}</p>
                  <p className="font-medium text-kavox-charcoal mt-1">{order.shippingAddress.phone}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
