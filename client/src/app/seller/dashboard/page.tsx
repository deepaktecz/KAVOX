'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Package, ShoppingBag, DollarSign, TrendingUp, Eye, Edit, Trash2, CheckCircle, Clock, XCircle } from 'lucide-react';
import { useRequireRole, useToast } from '@/hooks';
import { productApi, orderApi, getErrorMessage } from '@/lib/api';

export default function SellerDashboard() {
  const { user } = useRequireRole(['seller', 'admin']);
  const toast = useToast();

  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'orders'>('overview');

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [prodRes, ordRes] = await Promise.all([
        productApi.getMyProducts({ limit: 20 }),
        orderApi.getSellerOrders({ limit: 20 }),
      ]);
      setProducts(prodRes.data.data.products || []);
      setOrders(ordRes.data.data.orders || []);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Archive this product?')) return;
    try {
      await productApi.delete(id);
      toast.success('Product archived');
      setProducts(prev => prev.filter(p => p._id !== id));
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  const totalRevenue = orders.filter(o => o.paymentStatus === 'paid').reduce((s: number, o: any) => {
    const sellerItems = o.items?.filter((i: any) => i.seller === user?._id);
    return s + (sellerItems?.reduce((a: number, i: any) => a + i.totalItemPrice, 0) || 0);
  }, 0);

  const totalOrders = orders.length;
  const activeProducts = products.filter(p => p.status === 'active').length;
  const pendingReview = products.filter(p => p.status === 'pending_review').length;

  const STATUS_COLORS: Record<string, string> = {
    active: 'status-active', pending_review: 'status-pending',
    rejected: 'status-cancelled', draft: 'text-kavox-gray bg-kavox-sand border-kavox-border',
    archived: 'text-kavox-gray bg-kavox-sand border-kavox-border',
  };

  if (!user) return null;

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'products', label: `Products (${products.length})` },
    { id: 'orders', label: `Orders (${orders.length})` },
  ];

  return (
    <div className="min-h-screen bg-kavox-cream">
      {/* Header */}
      <div className="bg-white border-b border-kavox-border">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-kavox-black">Seller Dashboard</h1>
              <p className="text-sm text-kavox-gray font-light mt-0.5">
                {user.sellerProfile?.brandName || user.firstName + "'s Store"}
                {!user.sellerProfile?.isApproved && (
                  <span className="ml-2 text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Pending Approval</span>
                )}
              </p>
            </div>
            <Link href="/seller/products/add" className="btn-primary btn-sm flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Product
            </Link>
          </div>

          {/* Tabs */}
          <div className="flex gap-6 mt-5">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === tab.id ? 'border-kavox-black text-kavox-black' : 'border-transparent text-kavox-gray hover:text-kavox-charcoal'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-8">

        {/* ── OVERVIEW ─────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Revenue', value: `₹${totalRevenue.toLocaleString('en-IN')}`, icon: DollarSign, color: 'text-green-600 bg-green-50' },
                { label: 'Total Orders', value: totalOrders, icon: ShoppingBag, color: 'text-blue-600 bg-blue-50' },
                { label: 'Active Products', value: activeProducts, icon: Package, color: 'text-purple-600 bg-purple-50' },
                { label: 'Pending Review', value: pendingReview, icon: Clock, color: 'text-amber-600 bg-amber-50' },
              ].map(stat => (
                <div key={stat.label} className="bg-white rounded-sm border border-kavox-border p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-kavox-gray mb-2">{stat.label}</p>
                      <p className="text-2xl font-bold text-kavox-black">{stat.value}</p>
                    </div>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${stat.color}`}>
                      <stat.icon className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            {pendingReview > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-sm p-4 flex items-center gap-3">
                <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-800">{pendingReview} product{pendingReview > 1 ? 's' : ''} awaiting admin review</p>
                  <p className="text-xs text-amber-600 font-light">Products will be live after approval.</p>
                </div>
              </div>
            )}

            {/* Recent products */}
            <div className="bg-white rounded-sm border border-kavox-border overflow-hidden">
              <div className="px-5 py-4 border-b border-kavox-border flex items-center justify-between">
                <h2 className="font-bold text-kavox-black">Recent Products</h2>
                <button onClick={() => setActiveTab('products')} className="text-xs font-semibold text-kavox-accent hover:underline">View All →</button>
              </div>
              <div className="divide-y divide-kavox-border">
                {loading ? [1,2,3].map(i => <div key={i} className="skeleton h-16 m-4 rounded" />) :
                products.slice(0, 5).map(product => (
                  <div key={product._id} className="flex items-center gap-3 px-4 py-3.5">
                    <div className="w-10 h-12 bg-kavox-sand rounded flex-shrink-0 overflow-hidden">
                      <img src={product.images?.[0]?.url || '/placeholder.jpg'} alt={product.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-kavox-black line-clamp-1">{product.name}</p>
                      <p className="text-xs text-kavox-gray font-light">₹{product.sellingPrice?.toLocaleString('en-IN')} · {product.salesCount} sold</p>
                    </div>
                    <span className={`status-chip border text-xs ${STATUS_COLORS[product.status] || 'status-pending'}`}>{product.status?.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── PRODUCTS ──────────────────────────────────── */}
        {activeTab === 'products' && (
          <div className="bg-white rounded-sm border border-kavox-border overflow-hidden">
            <div className="px-5 py-4 border-b border-kavox-border flex items-center justify-between">
              <h2 className="font-bold text-kavox-black">My Products</h2>
              <Link href="/seller/products/add" className="btn-primary btn-sm flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add New
              </Link>
            </div>

            {loading ? (
              <div className="p-6 space-y-3">{[1,2,3,4].map(i => <div key={i} className="skeleton h-20 rounded" />)}</div>
            ) : products.length === 0 ? (
              <div className="text-center py-16">
                <Package className="w-12 h-12 text-kavox-tan mx-auto mb-3" />
                <p className="text-kavox-gray font-light mb-4">No products yet</p>
                <Link href="/seller/products/add" className="btn-primary btn-sm">Add Your First Product</Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-kavox-cream">
                    <tr>
                      {['Product', 'Price', 'Stock', 'Sales', 'Rating', 'Status', 'Actions'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-kavox-gray">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-kavox-border">
                    {products.map(product => (
                      <tr key={product._id} className="hover:bg-kavox-cream/50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-12 bg-kavox-sand rounded flex-shrink-0 overflow-hidden">
                              <img src={product.images?.[0]?.url || '/placeholder.jpg'} alt="" className="w-full h-full object-cover" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-kavox-black line-clamp-1">{product.name}</p>
                              <p className="text-xs text-kavox-gray font-light">{product.category}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm font-bold text-kavox-black">₹{product.sellingPrice?.toLocaleString('en-IN')}</td>
                        <td className="px-5 py-4">
                          <span className={`text-sm font-semibold ${product.totalStock === 0 ? 'text-red-500' : product.totalStock <= 5 ? 'text-amber-600' : 'text-kavox-charcoal'}`}>
                            {product.totalStock}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-kavox-charcoal">{product.salesCount}</td>
                        <td className="px-5 py-4 text-sm text-kavox-charcoal">{product.rating?.toFixed(1)} ★</td>
                        <td className="px-5 py-4">
                          <span className={`status-chip border text-xs ${STATUS_COLORS[product.status] || 'status-pending'}`}>
                            {product.status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1">
                            <Link href={`/product/${product.slug}`} className="btn-icon w-7 h-7" title="View"><Eye className="w-3.5 h-3.5" /></Link>
                            <Link href={`/seller/products/edit/${product._id}`} className="btn-icon w-7 h-7" title="Edit"><Edit className="w-3.5 h-3.5" /></Link>
                            <button onClick={() => handleDeleteProduct(product._id)} className="w-7 h-7 flex items-center justify-center text-kavox-silver hover:text-red-500 transition-colors rounded-full" title="Archive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ORDERS ────────────────────────────────────── */}
        {activeTab === 'orders' && (
          <div className="bg-white rounded-sm border border-kavox-border overflow-hidden">
            <div className="px-5 py-4 border-b border-kavox-border">
              <h2 className="font-bold text-kavox-black">Orders for My Products</h2>
            </div>
            {loading ? (
              <div className="p-6 space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-20 rounded" />)}</div>
            ) : orders.length === 0 ? (
              <div className="text-center py-16">
                <ShoppingBag className="w-12 h-12 text-kavox-tan mx-auto mb-3" />
                <p className="text-kavox-gray font-light">No orders yet. Get your products approved to start selling!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-kavox-cream">
                    <tr>
                      {['Order', 'Customer', 'Items', 'Amount', 'Status', 'Date'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-kavox-gray">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-kavox-border">
                    {orders.map(order => (
                      <tr key={order._id} className="hover:bg-kavox-cream/50 transition-colors">
                        <td className="px-5 py-4 font-mono text-sm font-bold text-kavox-accent">#{order.orderNumber}</td>
                        <td className="px-5 py-4 text-sm text-kavox-charcoal">{order.user?.firstName} {order.user?.lastName}</td>
                        <td className="px-5 py-4 text-sm text-kavox-charcoal">{order.items?.length} items</td>
                        <td className="px-5 py-4 text-sm font-bold text-kavox-black">₹{order.totalAmount?.toLocaleString('en-IN')}</td>
                        <td className="px-5 py-4">
                          <span className={`status-chip border text-xs ${order.status === 'delivered' ? 'status-delivered' : order.status === 'cancelled' ? 'status-cancelled' : order.status === 'shipped' ? 'status-shipped' : 'status-processing'}`}>
                            {order.status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs text-kavox-gray font-light">
                          {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
