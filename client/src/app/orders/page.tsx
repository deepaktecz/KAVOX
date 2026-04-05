'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Package, ChevronRight, Filter, Calendar, MapPin, TrendingUp } from 'lucide-react';
import { useAppSelector, useRequireAuth, useToast } from '@/hooks';
import { orderApi, getErrorMessage } from '@/lib/api';

interface Order {
  _id: string;
  orderId: string;
  items: any[];
  status: string;
  total: number;
  createdAt: string;
  shippingAddress: {
    fullName: string;
    addressLine1: string;
    city: string;
  };
}

export default function OrdersPage() {
  useRequireAuth();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAppSelector(s => s.auth);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadOrders();
  }, [filter]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const response = await orderApi.getMyOrders({ page: 1 });
      if (response.data.success) {
        let filtered = response.data.data;
        if (filter !== 'all') {
          filtered = filtered.filter((o: Order) => o.status === filter);
        }
        setOrders(filtered);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      processing: 'bg-purple-100 text-purple-800',
      printing: 'bg-indigo-100 text-indigo-800',
      shipped: 'bg-cyan-100 text-cyan-800',
      delivered: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      returned: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusIcon = (status: string) => {
    const icons: { [key: string]: string } = {
      pending: '⏳',
      confirmed: '✓',
      processing: '⚙️',
      printing: '🖨️',
      shipped: '📦',
      delivered: '✅',
      cancelled: '❌',
      returned: '🔄',
    };
    return icons[status] || '•';
  };

  const filters = [
    { label: 'All Orders', value: 'all' },
    { label: 'Pending', value: 'pending' },
    { label: 'Confirmed', value: 'confirmed' },
    { label: 'Processing', value: 'processing' },
    { label: 'Shipped', value: 'shipped' },
    { label: 'Delivered', value: 'delivered' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-kavox-charcoal mb-2">My Orders</h1>
          <p className="text-gray-600">Track and manage your orders here</p>
        </div>

        {/* Filter Tabs */}
        <div className="mb-6 bg-white rounded-lg shadow-sm p-4 overflow-x-auto">
          <div className="flex gap-2 flex-1">
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition ${
                  filter === f.value
                    ? 'bg-kavox-accent text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-lg h-32 animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && orders.length === 0 && (
          <div className="text-center py-16 bg-white rounded-lg">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-700 mb-2">No orders found</h2>
            <p className="text-gray-600 mb-6">You haven't placed any orders yet</p>
            <Link
              href="/shop"
              className="inline-block bg-kavox-accent text-white px-8 py-3 rounded-lg font-semibold hover:bg-kavox-accent-dark transition"
            >
              Start Shopping
            </Link>
          </div>
        )}

        {/* Orders List */}
        <div className="space-y-4">
          {orders.map((order) => (
            <Link
              key={order._id}
              href={`/orders/${order._id}`}
              className="block bg-white rounded-lg shadow-sm hover:shadow-md transition p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-kavox-charcoal text-lg">{order.orderId}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {new Date(order.createdAt).toLocaleDateString('en-IN', {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-kavox-accent">₹{order.total.toLocaleString()}</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold mt-2 ${getStatusColor(order.status)}`}>
                    {getStatusIcon(order.status)} {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-gray-200">
                <div className="flex gap-2 text-gray-600">
                  <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">{order.shippingAddress.fullName}</p>
                    <p className="text-xs text-gray-500">{order.shippingAddress.city}</p>
                  </div>
                </div>
                <div className="text-right text-sm text-gray-600">
                  <p className="font-medium">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</p>
                  <p className="text-xs text-gray-500">in this order</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  {order.items.slice(0, 3).map((item, i) => (
                    <div key={i} className="w-10 h-10 bg-gray-200 rounded text-xs flex items-center justify-center">
                      {item.image ? <img src={item.image} alt="" className="w-full h-full object-cover rounded" /> : '📦'}
                    </div>
                  ))}
                  {order.items.length > 3 && (
                    <div className="w-10 h-10 bg-gray-200 rounded text-xs flex items-center justify-center font-bold">
                      +{order.items.length - 3}
                    </div>
                  )}
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
