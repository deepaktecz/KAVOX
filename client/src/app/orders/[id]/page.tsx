'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useSelector } from 'react-redux';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Package, Truck, CheckCircle2, AlertCircle, RotateCw } from 'lucide-react';
import api from '@/lib/api';
import { RootState } from '@/store';

interface OrderItem {
  id: string;
  productId: string;
  name: string;
  variant: {
    color?: { name: string; code: string };
    size?: string;
    sku?: string;
  };
  quantity: number;
  price: number;
  image?: string;
}

interface ReturnRequest {
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  reason: string;
  requestedAt: string;
  approvedAt?: string;
  refundAmount?: number;
}

interface Order {
  _id: string;
  orderId: string;
  items: OrderItem[];
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  paymentInfo: {
    method: 'razorpay' | 'cod';
    status: 'pending' | 'completed' | 'failed';
    transactionId?: string;
  };
  trackingNumber?: string;
  returnRequest?: ReturnRequest;
  createdAt: string;
  updatedAt: string;
}

const statusSteps = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
const statusLabels: Record<string, string> = {
  pending: 'Order Placed',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  processing: 'bg-purple-100 text-purple-800',
  shipped: 'bg-cyan-100 text-cyan-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const auth = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        setIsLoading(true);
        const response = await api.get(`/orders/${orderId}`);
        setOrder(response.data);
        setError(null);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load order details');
      } finally {
        setIsLoading(false);
      }
    };

    if (orderId && auth.user) {
      fetchOrder();
    }
  }, [orderId, auth.user]);

  const handleReturnRequest = async () => {
    if (!order || !returnReason.trim()) return;

    try {
      await api.post(`/orders/${order._id}/return-request`, {
        reason: returnReason,
      });

      // Refresh order data
      const response = await api.get(`/orders/${orderId}`);
      setOrder(response.data);
      setShowReturnForm(false);
      setReturnReason('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create return request');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <Link href="/orders" className="flex items-center text-blue-600 mb-6 hover:text-blue-800">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Orders
          </Link>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
              <span className="text-red-800">{error || 'Order not found'}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentStepIndex = statusSteps.indexOf(order.status);
  const canReturn = order.status === 'delivered' && !order.returnRequest;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <Link href="/orders" className="flex items-center text-blue-600 mb-6 hover:text-blue-800">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Orders
        </Link>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-2xl font-bold mb-2">Order {order.orderId}</h1>
              <p className="text-gray-600">
                Placed on {new Date(order.createdAt).toLocaleDateString()}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusColors[order.status]}`}>
              {statusLabels[order.status]}
            </span>
          </div>

          {/* Order Timeline */}
          <div className="mt-6 pt-6 border-t">
            <h3 className="text-lg font-semibold mb-4">Order Timeline</h3>
            <div className="flex justify-between">
              {statusSteps.map((step, index) => (
                <div key={step} className="flex flex-col items-center flex-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                      index <= currentStepIndex ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {index <= currentStepIndex ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <Package className="w-5 h-5" />
                    )}
                  </div>
                  <span className="text-xs font-medium text-center">{statusLabels[step]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Order Items</h2>
          <div className="space-y-4">
            {order.items.map((item) => (
              <Link
                key={item.id}
                href={`/product/${item.productId}`}
                className="flex gap-4 pb-4 border-b last:border-b-0 hover:bg-gray-50 p-2 rounded transition"
              >
                {item.image && (
                  <div className="relative w-24 h-24 flex-shrink-0">
                    <Image src={item.image} alt={item.name} fill className="object-cover rounded" />
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{item.name}</h3>
                  {item.variant.color && (
                    <p className="text-sm text-gray-600">Color: {item.variant.color.name}</p>
                  )}
                  {item.variant.size && <p className="text-sm text-gray-600">Size: {item.variant.size}</p>}
                  <div className="flex justify-between mt-2">
                    <span className="text-gray-600">Qty: {item.quantity}</span>
                    <span className="font-semibold">₹{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Price Details</h2>
          <div className="space-y-3 mb-4 pb-4 border-b">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span>₹{order.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Shipping</span>
              <span>₹{order.shipping.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Tax</span>
              <span>₹{order.tax.toFixed(2)}</span>
            </div>
          </div>
          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span>₹{order.total.toFixed(2)}</span>
          </div>
        </div>

        {/* Shipping Info */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Shipping Address</h2>
          <div className="text-gray-700 space-y-1">
            <p>{order.shippingAddress.street}</p>
            <p>
              {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zipCode}
            </p>
            <p>{order.shippingAddress.country}</p>
          </div>

          {order.trackingNumber && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center">
                <Truck className="w-5 h-5 text-blue-600 mr-2" />
                <span className="text-sm">
                  <strong>Tracking:</strong> {order.trackingNumber}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Payment Info */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Payment Info</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Method</span>
              <span className="capitalize">{order.paymentInfo.method === 'cod' ? 'Cash on Delivery' : 'Razorpay'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Status</span>
              <span className={`capitalize ${order.paymentInfo.status === 'completed' ? 'text-green-600' : 'text-yellow-600'}`}>
                {order.paymentInfo.status}
              </span>
            </div>
            {order.paymentInfo.transactionId && (
              <div className="flex justify-between">
                <span className="text-gray-600">Transaction ID</span>
                <span className="text-sm font-mono">{order.paymentInfo.transactionId}</span>
              </div>
            )}
          </div>
        </div>

        {/* Return Section */}
        {canReturn && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4">Return Request</h2>
            {!showReturnForm ? (
              <button
                onClick={() => setShowReturnForm(true)}
                className="flex items-center px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
              >
                <RotateCw className="w-4 h-4 mr-2" />
                Request Return
              </button>
            ) : (
              <div className="space-y-4">
                <textarea
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Please explain the reason for return..."
                  className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={4}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleReturnRequest}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
                  >
                    Submit Request
                  </button>
                  <button
                    onClick={() => {
                      setShowReturnForm(false);
                      setReturnReason('');
                    }}
                    className="px-4 py-2 border rounded hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Return Status */}
        {order.returnRequest && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Return Request Status</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Status</span>
                <span className={`capitalize font-semibold ${
                  order.returnRequest.status === 'approved' ? 'text-green-600' :
                  order.returnRequest.status === 'rejected' ? 'text-red-600' :
                  'text-yellow-600'
                }`}>
                  {order.returnRequest.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Reason</span>
                <span>{order.returnRequest.reason}</span>
              </div>
              {order.returnRequest.refundAmount && (
                <div className="flex justify-between border-t pt-2">
                  <span className="text-gray-600 font-semibold">Refund Amount</span>
                  <span className="font-semibold text-green-600">₹{order.returnRequest.refundAmount.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
