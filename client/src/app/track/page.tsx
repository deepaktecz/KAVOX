'use client';

import { useState } from 'react';
import { Search, Package, Truck, CheckCircle, Clock, MapPin } from 'lucide-react';
import { orderApi, getErrorMessage } from '@/lib/api';
import { useToast } from '@/hooks';

const STEPS = ['Confirmed', 'Processing', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered'];
const STATUS_STEP: Record<string, number> = {
  confirmed: 1, processing: 2, packed: 3, shipped: 4, out_for_delivery: 5, delivered: 6,
};

export default function TrackOrderPage() {
  const toast = useToast();
  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim() || !phone.trim()) { toast.error('Please enter order number and phone'); return; }
    setLoading(true);
    try {
      const { data } = await orderApi.trackOrder({ orderNumber: orderNumber.trim(), phone: phone.trim() });
      setOrder(data.data.order);
    } catch (e) {
      toast.error(getErrorMessage(e));
      setOrder(null);
    } finally { setLoading(false); }
  };

  const currentStep = STATUS_STEP[order?.status] || 0;

  return (
    <div className="min-h-screen bg-kavox-cream">
      <div className="bg-kavox-charcoal text-white py-12 md:py-16 text-center">
        <div className="max-w-xl mx-auto px-4">
          <Package className="w-10 h-10 text-kavox-accent mx-auto mb-4" />
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Track Your Order</h1>
          <p className="text-kavox-silver font-light">Enter your order number and phone to see live updates</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Search form */}
        <div className="bg-white rounded-sm border border-kavox-border p-6 mb-6">
          <form onSubmit={handleTrack} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="label">Order Number</label>
                <input className="input font-mono" placeholder="KVX240101xxxxx" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="label">Phone Number</label>
                <input className="input" placeholder="10-digit number" value={phone} onChange={e => setPhone(e.target.value)} required maxLength={10} />
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 flex items-center justify-center gap-2">
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Search className="w-4 h-4" />}
              {loading ? 'Tracking...' : 'Track Order'}
            </button>
          </form>
        </div>

        {/* Results */}
        {order && (
          <div className="space-y-5 animate-fade-in-up">
            {/* Header */}
            <div className="bg-white rounded-sm border border-kavox-border p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs text-kavox-gray font-light mb-1">Order Number</p>
                  <p className="font-bold font-mono text-kavox-black text-lg">#{order.orderNumber}</p>
                </div>
                <span className={`status-chip border text-xs ${order.status === 'delivered' ? 'status-delivered' : order.status === 'cancelled' ? 'status-cancelled' : order.status === 'shipped' || order.status === 'out_for_delivery' ? 'status-shipped' : 'status-processing'}`}>
                  {order.status?.replace(/_/g, ' ')}
                </span>
              </div>

              {/* Progress */}
              {currentStep > 0 && (
                <div className="relative mt-6">
                  <div className="absolute top-4 left-4 right-4 h-0.5 bg-kavox-border">
                    <div className="h-full bg-kavox-accent transition-all duration-700" style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }} />
                  </div>
                  <div className="relative flex justify-between">
                    {STEPS.map((step, i) => {
                      const done = currentStep > i;
                      const active = currentStep === i + 1;
                      return (
                        <div key={step} className="flex flex-col items-center gap-2">
                          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center z-10 ${done ? 'bg-kavox-accent border-kavox-accent' : active ? 'border-kavox-accent bg-white' : 'border-kavox-border bg-white'}`}>
                            {done ? <CheckCircle className="w-4 h-4 text-white" /> : <span className={`text-xs font-bold ${active ? 'text-kavox-accent' : 'text-kavox-silver'}`}>{i + 1}</span>}
                          </div>
                          <span className={`text-[9px] text-center font-medium max-w-[50px] leading-tight ${done || active ? 'text-kavox-charcoal' : 'text-kavox-silver'}`}>{step}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tracking number */}
              {order.trackingNumber && (
                <div className="mt-4 p-3 bg-kavox-cream rounded-sm border border-kavox-border flex items-center gap-2">
                  <Truck className="w-4 h-4 text-kavox-accent flex-shrink-0" />
                  <p className="text-sm"><span className="text-kavox-gray font-light">{order.courierName || 'Courier'}:</span> <span className="font-mono font-bold text-kavox-black">{order.trackingNumber}</span></p>
                </div>
              )}
            </div>

            {/* Estimated delivery */}
            {order.estimatedDelivery && order.status !== 'delivered' && (
              <div className="bg-blue-50 border border-blue-200 rounded-sm p-4 flex items-center gap-3">
                <Clock className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <p className="text-sm text-blue-800">
                  <strong>Expected delivery:</strong>{' '}
                  {new Date(order.estimatedDelivery).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
            )}

            {/* Items */}
            {order.items?.length > 0 && (
              <div className="bg-white rounded-sm border border-kavox-border p-5">
                <h3 className="font-bold text-kavox-black text-sm uppercase tracking-wider mb-4">Items in this Order</h3>
                <div className="space-y-3">
                  {order.items.map((item: any, i: number) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-kavox-gray font-light w-4">{item.quantity}×</span>
                      <p className="text-sm text-kavox-charcoal font-medium flex-1">{item.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline */}
            {order.trackingEvents?.length > 0 && (
              <div className="bg-white rounded-sm border border-kavox-border p-5">
                <h3 className="font-bold text-kavox-black text-sm uppercase tracking-wider mb-4">Status History</h3>
                <div className="space-y-4">
                  {[...order.trackingEvents].reverse().map((ev: any, i: number) => (
                    <div key={i} className="flex gap-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${i === 0 ? 'bg-kavox-accent' : 'bg-kavox-border'}`} />
                      <div>
                        <p className="text-sm font-semibold capitalize text-kavox-charcoal">{ev.status?.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-kavox-gray font-light">{ev.message}</p>
                        <p className="text-xs text-kavox-silver mt-0.5">{new Date(ev.timestamp).toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Delivery address */}
            <div className="bg-white rounded-sm border border-kavox-border p-5">
              <h3 className="font-bold text-kavox-black text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-kavox-accent" /> Delivery Address
              </h3>
              <p className="text-sm font-semibold text-kavox-charcoal">{order.shippingAddress?.fullName}</p>
              <p className="text-sm text-kavox-gray font-light">
                {order.shippingAddress?.addressLine1}, {order.shippingAddress?.city}, {order.shippingAddress?.state} {order.shippingAddress?.pincode}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
