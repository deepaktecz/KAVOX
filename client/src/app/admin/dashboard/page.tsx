'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, ShoppingBag, DollarSign, Package,
  RefreshCw, Check, X, Zap, BarChart2, Settings,
  ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';
import { useRequireRole, useToast } from '@/hooks';
import { adminApi, orderApi, productApi, qikinkApi, getErrorMessage } from '@/lib/api';

// ─── Helpers ──────────────────────────────────────────────────
const fmt = (n: number) => (n || 0).toLocaleString('en-IN');

const GrowthBadge = ({ value }: { value: number | null }) => {
  if (value === null) return <span className="text-xs text-kavox-gray font-light">vs prev period</span>;
  if (value > 0) return <span className="flex items-center gap-0.5 text-xs text-green-600 font-semibold"><ArrowUpRight className="w-3 h-3" />+{value}%</span>;
  if (value < 0) return <span className="flex items-center gap-0.5 text-xs text-red-500 font-semibold"><ArrowDownRight className="w-3 h-3" />{value}%</span>;
  return <span className="flex items-center gap-0.5 text-xs text-kavox-gray"><Minus className="w-3 h-3" />0%</span>;
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Pending Payment', confirmed: 'Confirmed', processing: 'Processing',
  packed: 'Packed', shipped: 'Shipped', out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered', cancelled: 'Cancelled', return_requested: 'Return Requested', returned: 'Returned',
};
const STATUS_COLORS: Record<string, string> = {
  pending_payment: 'status-pending', confirmed: 'status-confirmed', processing: 'status-processing',
  packed: 'status-confirmed', shipped: 'status-shipped', out_for_delivery: 'status-shipped',
  delivered: 'status-delivered', cancelled: 'status-cancelled', return_requested: 'status-pending', returned: 'status-cancelled',
};
const PAY_BADGE: Record<string, string> = {
  paid: 'bg-green-50 text-green-700', pending: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-600', refunded: 'bg-blue-50 text-blue-600',
};
const QK_BADGE: Record<string, string> = {
  processing: 'bg-purple-50 text-purple-700', packed: 'bg-indigo-50 text-indigo-700',
  shipped: 'bg-blue-50 text-blue-700', delivered: 'bg-green-50 text-green-700',
  failed: 'bg-red-50 text-red-600', submitted: 'bg-gray-100 text-gray-600',
};

// ─────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { user } = useRequireRole(['admin', 'super_admin']);
  const toast = useToast();

  const [dashData, setDashData] = useState<any>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [pendingProducts, setPendingProducts] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30');
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'products' | 'qikink'>('overview');

  // Orders tab
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderFilter, setOrderFilter] = useState('');
  const [orderPage, setOrderPage] = useState(1);
  const [orderMeta, setOrderMeta] = useState({ total: 0, pages: 1 });

  // Products tab
  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [marginCategory, setMarginCategory] = useState('');
  const [marginPercent, setMarginPercent] = useState('');
  const [settingMargin, setSettingMargin] = useState(false);

  // Qikink tab
  const [polling, setPolling] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // ── Load Overview ──────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, ordersRes, analyticsRes] = await Promise.all([
        adminApi.getDashboard({ period }),
        adminApi.getOrders({ limit: 8, sortBy: 'createdAt', order: 'desc' }),
        orderApi.adminGetAnalytics({ period }),
      ]);
      setDashData(dashRes.data.data);
      setRecentOrders(ordersRes.data.data?.orders || []);
      setTopProducts(analyticsRes.data.data?.topProducts || []);
      // Try to get pending products (non-critical)
      productApi.adminGetAll?.({ status: 'pending_review', limit: 5 })
        .then((r: any) => setPendingProducts(r.data.data?.products || []))
        .catch(() => {});
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { if (user) loadDashboard(); }, [user, period, loadDashboard]);

  // ── Load Orders ────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const params: any = { page: orderPage, limit: 15 };
      if (orderFilter) params.status = orderFilter;
      const res = await adminApi.getOrders(params);
      setOrders(res.data.data?.orders || []);
      setOrderMeta(res.data.meta || { total: 0, pages: 1 });
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setOrdersLoading(false); }
  }, [orderPage, orderFilter]);

  useEffect(() => { if (activeTab === 'orders') loadOrders(); }, [activeTab, orderPage, orderFilter, loadOrders]);

  // ── Load Products ──────────────────────────────────────
  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const res = await adminApi.getProducts({ limit: 30 });
      setProducts(res.data.data?.products || []);
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setProductsLoading(false); }
  }, []);

  useEffect(() => { if (activeTab === 'products') loadProducts(); }, [activeTab, loadProducts]);

  // ── Actions ────────────────────────────────────────────
  const handleProductAction = async (id: string, action: 'approve' | 'reject') => {
    try {
      await productApi.reviewProduct(id, { action });
      toast.success(`Product ${action}d`);
      setPendingProducts((p) => p.filter((x) => x._id !== id));
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  const handleOrderStatus = async (id: string, status: string) => {
    try {
      await orderApi.adminUpdateStatus(id, { status });
      toast.success('Status updated');
      loadDashboard();
      if (activeTab === 'orders') loadOrders();
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  const handleSetMargin = async () => {
    const pct = parseFloat(marginPercent);
    if (!marginCategory) { toast.error('Select a category'); return; }
    if (isNaN(pct) || pct < 1 || pct >= 100) { toast.error('Margin must be 1–99'); return; }
    setSettingMargin(true);
    try {
      const res = await adminApi.setMargin({ category: marginCategory, marginPercent: pct });
      toast.success(res.data.message || `Margin set to ${pct}%`);
      setMarginCategory(''); setMarginPercent('');
      loadProducts();
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setSettingMargin(false); }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (!confirm(`Archive "${name}"? It will be hidden from the store.`)) return;
    try {
      await adminApi.deleteProduct(id);
      toast.success('Product archived');
      setProducts((p) => p.filter((x) => x._id !== id));
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  const handleSyncQikink = async () => {
    setSyncing(true);
    try {
      const res = await qikinkApi.syncProducts();
      const d = res.data.data;
      toast.success(`Synced ${d.synced} products (${d.skipped} skipped)`);
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setSyncing(false); }
  };

  const handlePollQikink = async () => {
    setPolling(true);
    try {
      const res = await qikinkApi.pollStatus();
      const d = res.data.data;
      toast.success(`Updated ${d.updated} / ${d.total} orders`);
      loadDashboard();
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setPolling(false); }
  };

  if (!user) return null;

  const s = dashData?.summary || {};
  const statCards = [
    { label: 'Total Revenue', value: `₹${fmt(s.totalRevenue)}`, sub: `Last ${period} days`, growth: s.revenueGrowth ?? null, icon: DollarSign, bg: 'bg-green-50 text-green-600' },
    { label: 'Qikink Cost', value: `₹${fmt(s.totalQikinkCost)}`, sub: 'Print-on-demand base cost', growth: null as number | null, icon: Package, bg: 'bg-orange-50 text-orange-600' },
    { label: 'Net Profit', value: `₹${fmt(s.totalProfit)}`, sub: `${s.profitMargin || 0}% margin`, growth: s.profitGrowth ?? null, icon: TrendingUp, bg: 'bg-blue-50 text-blue-600' },
    { label: 'Total Orders', value: fmt(s.totalOrders), sub: `${s.pendingOrders || 0} need action`, growth: s.orderGrowth ?? null, icon: ShoppingBag, bg: 'bg-purple-50 text-purple-600' },
  ];

  const CATEGORIES = ['T-Shirts','Oversized T-Shirts','Polo T-Shirts','Graphic Tees','Hoodies','Sweatshirts','Jackets','Shirts','Shorts','Joggers','Caps & Hats','Accessories','Custom Design'];

  return (
    <div className="min-h-screen bg-kavox-cream">

      {/* Header */}
      <div className="bg-white border-b border-kavox-border px-6 lg:px-10 py-5">
        <div className="max-w-screen-xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <h1 className="text-2xl font-bold text-kavox-black">Admin Dashboard</h1>
            <p className="text-sm text-kavox-gray mt-0.5 font-light">Welcome back, {user.firstName}</p>
          </div>
          <div className="flex items-center gap-3">
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="text-sm border border-kavox-border rounded-sm px-3 py-2 bg-white focus:outline-none">
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
            </select>
            <button onClick={loadDashboard} className="btn-icon border border-kavox-border" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Tab Nav */}
      <div className="bg-white border-b border-kavox-border px-6 lg:px-10">
        <div className="max-w-screen-xl mx-auto flex">
          {(['overview','orders','products','qikink'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3.5 text-sm font-medium capitalize border-b-2 transition-colors ${activeTab === tab ? 'border-kavox-black text-kavox-black' : 'border-transparent text-kavox-gray hover:text-kavox-charcoal'}`}
            >
              {tab === 'qikink' ? '🔗 Qikink' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-6">

        {/* ══ OVERVIEW ══ */}
        {activeTab === 'overview' && <>

          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map((card) => (
              <div key={card.label} className="bg-white rounded-sm border border-kavox-border p-5">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-kavox-gray">{card.label}</p>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${card.bg}`}>
                    <card.icon className="w-4 h-4" />
                  </div>
                </div>
                <p className={`text-2xl font-bold text-kavox-black ${loading ? 'opacity-30' : ''}`}>{loading ? '—' : card.value}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-kavox-gray font-light">{card.sub}</p>
                  <GrowthBadge value={card.growth} />
                </div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Revenue vs Profit chart */}
            <div className="lg:col-span-2 bg-white rounded-sm border border-kavox-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-kavox-black flex items-center gap-2"><BarChart2 className="w-4 h-4 text-kavox-accent" /> Revenue vs Profit (daily)</h2>
                <div className="flex gap-3 text-xs text-kavox-gray">
                  <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-kavox-accent inline-block" />Rev</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-green-400 inline-block" />Profit</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-orange-300 inline-block" />Cost</span>
                </div>
              </div>
              {dashData?.dailyRevenue?.length > 0 ? (
                <div className="flex items-end gap-1 h-44">
                  {dashData.dailyRevenue.slice(-14).map((day: any) => {
                    const maxRev = Math.max(...dashData.dailyRevenue.map((d: any) => d.revenue));
                    const h = (v: number) => maxRev > 0 ? `${(v / maxRev) * 100}%` : '3px';
                    return (
                      <div key={day._id} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-kavox-charcoal text-white text-xs px-2 py-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-lg">
                          <p>Rev: ₹{fmt(day.revenue)}</p>
                          <p>Profit: ₹{fmt(day.profit)}</p>
                          <p>Cost: ₹{fmt(day.qikinkCost)}</p>
                          <p className="text-gray-400 text-[10px]">{day._id}</p>
                        </div>
                        <div className="w-full flex gap-0.5 items-end h-36">
                          <div className="flex-1 bg-kavox-accent rounded-t-sm transition-all" style={{ height: h(day.revenue), minHeight: 3 }} />
                          <div className="flex-1 bg-green-400 rounded-t-sm" style={{ height: h(day.profit), minHeight: 3 }} />
                          <div className="flex-1 bg-orange-300 rounded-t-sm" style={{ height: h(day.qikinkCost), minHeight: 3 }} />
                        </div>
                        <span className="text-[9px] text-kavox-silver">{day._id?.slice(8)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-44 flex items-center justify-center text-kavox-gray text-sm font-light">No revenue data for this period</div>
              )}
            </div>

            {/* Status + Qikink breakdown */}
            <div className="space-y-4">
              <div className="bg-white rounded-sm border border-kavox-border p-5">
                <h3 className="font-bold text-kavox-black mb-3 text-sm">Order Status</h3>
                <div className="space-y-2.5">
                  {(dashData?.statusBreakdown || []).map((item: any) => (
                    <div key={item._id} className="flex items-center justify-between">
                      <span className={`${STATUS_COLORS[item._id] || 'status-pending'} text-xs`}>{STATUS_LABELS[item._id] || item._id}</span>
                      <span className="font-bold text-sm">{item.count}</span>
                    </div>
                  ))}
                  {!dashData?.statusBreakdown?.length && <p className="text-xs text-kavox-gray">No data</p>}
                </div>
              </div>
              <div className="bg-white rounded-sm border border-kavox-border p-5">
                <h3 className="font-bold text-kavox-black mb-3 text-sm flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-purple-500" /> Qikink Status</h3>
                <div className="space-y-2">
                  {(dashData?.qikinkStats || []).map((item: any) => (
                    <div key={item._id} className="flex items-center justify-between">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${QK_BADGE[item._id] || 'bg-gray-100 text-gray-600'}`}>{item._id || 'Not submitted'}</span>
                      <span className="font-bold text-sm">{item.count}</span>
                    </div>
                  ))}
                  {!dashData?.qikinkStats?.length && <p className="text-xs text-kavox-gray">No Qikink orders yet</p>}
                </div>
              </div>
            </div>
          </div>

          {/* Pending Approvals + Recent Orders */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-sm border border-kavox-border overflow-hidden">
              <div className="px-6 py-4 border-b border-kavox-border flex items-center justify-between">
                <h2 className="font-bold text-kavox-black">Pending Approvals</h2>
                {pendingProducts.length > 0 && <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full">{pendingProducts.length}</span>}
              </div>
              <div className="divide-y divide-kavox-border">
                {pendingProducts.length === 0 ? (
                  <div className="px-6 py-8 text-center text-sm text-kavox-gray font-light">All products reviewed ✓</div>
                ) : pendingProducts.map((p) => (
                  <div key={p._id} className="flex items-center gap-3 px-4 py-3.5">
                    <div className="w-10 h-12 bg-kavox-sand rounded flex-shrink-0 overflow-hidden">
                      <img src={p.images?.[0]?.url || '/placeholder.jpg'} alt={p.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-kavox-black line-clamp-1">{p.name}</p>
                      <p className="text-xs text-kavox-gray">₹{fmt(p.sellingPrice)} · {p.category}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => handleProductAction(p._id, 'approve')} className="w-8 h-8 bg-green-50 text-green-600 hover:bg-green-100 rounded-sm flex items-center justify-center transition"><Check className="w-4 h-4" /></button>
                      <button onClick={() => handleProductAction(p._id, 'reject')} className="w-8 h-8 bg-red-50 text-red-500 hover:bg-red-100 rounded-sm flex items-center justify-center transition"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-sm border border-kavox-border overflow-hidden">
              <div className="px-6 py-4 border-b border-kavox-border flex items-center justify-between">
                <h2 className="font-bold text-kavox-black">Recent Orders</h2>
                <button onClick={() => setActiveTab('orders')} className="text-xs text-kavox-accent hover:underline">View all →</button>
              </div>
              <div className="divide-y divide-kavox-border">
                {recentOrders.map((order) => (
                  <div key={order._id} className="px-4 py-3.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold font-mono text-kavox-black">{order.orderNumber}</span>
                      <span className="text-sm font-bold">₹{fmt(order.totalAmount)}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`${STATUS_COLORS[order.status] || 'status-pending'} text-xs`}>{STATUS_LABELS[order.status] || order.status}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${PAY_BADGE[order.paymentStatus] || 'bg-gray-100 text-gray-600'}`}>{order.paymentStatus}</span>
                      {order.qikinkFulfillmentStatus && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${QK_BADGE[order.qikinkFulfillmentStatus] || 'bg-gray-100 text-gray-600'}`}>QK: {order.qikinkFulfillmentStatus}</span>
                      )}
                      <span className="text-xs text-kavox-gray ml-auto">₹{fmt(order.totalProfit || 0)} profit</span>
                    </div>
                  </div>
                ))}
                {!recentOrders.length && <div className="px-6 py-8 text-center text-sm text-kavox-gray font-light">No recent orders</div>}
              </div>
            </div>
          </div>

          {/* Top Products */}
          {topProducts.length > 0 && (
            <div className="bg-white rounded-sm border border-kavox-border overflow-hidden">
              <div className="px-6 py-4 border-b border-kavox-border"><h2 className="font-bold text-kavox-black">Top Products by Profit</h2></div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-kavox-cream">
                    <tr>{['#','Product','Units','Revenue','Qikink Cost','Net Profit'].map((h) => <th key={h} className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-kavox-gray whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-kavox-border">
                    {topProducts.map((p: any, i: number) => (
                      <tr key={p._id} className="hover:bg-kavox-cream/50 transition-colors">
                        <td className="px-5 py-3.5"><span className="w-6 h-6 rounded-full bg-kavox-accent text-white text-xs flex items-center justify-center font-bold">{i+1}</span></td>
                        <td className="px-5 py-3.5 text-sm font-medium text-kavox-black max-w-[180px]"><span className="line-clamp-1">{p.name}</span></td>
                        <td className="px-5 py-3.5 text-sm font-semibold">{p.totalSold}</td>
                        <td className="px-5 py-3.5 text-sm text-kavox-charcoal">₹{fmt(p.revenue)}</td>
                        <td className="px-5 py-3.5 text-sm text-orange-600">₹{fmt(p.qikinkCost)}</td>
                        <td className="px-5 py-3.5 text-sm text-green-600 font-semibold">₹{fmt(p.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>}

        {/* ══ ORDERS TAB ══ */}
        {activeTab === 'orders' && (
          <div className="bg-white rounded-sm border border-kavox-border overflow-hidden">
            <div className="px-6 py-4 border-b border-kavox-border flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <h2 className="font-bold text-kavox-black">All Orders <span className="text-kavox-gray font-normal text-sm ml-2">({orderMeta.total} total)</span></h2>
              <div className="flex gap-2">
                <select value={orderFilter} onChange={(e) => { setOrderFilter(e.target.value); setOrderPage(1); }} className="text-sm border border-kavox-border rounded-sm px-3 py-2 bg-white focus:outline-none">
                  <option value="">All Statuses</option>
                  {Object.entries(STATUS_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button onClick={loadOrders} className="btn-icon border border-kavox-border"><RefreshCw className={`w-4 h-4 ${ordersLoading ? 'animate-spin' : ''}`} /></button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-kavox-cream">
                  <tr>{['Order','Customer','Amount','Profit','Payment','Status','Qikink','Date','Action'].map((h) => <th key={h} className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-kavox-gray whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-kavox-border">
                  {ordersLoading ? <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-kavox-gray">Loading…</td></tr>
                  : orders.length === 0 ? <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-kavox-gray">No orders</td></tr>
                  : orders.map((order) => (
                    <tr key={order._id} className="hover:bg-kavox-cream/40 transition-colors">
                      <td className="px-4 py-3.5 font-mono text-xs font-semibold text-kavox-black whitespace-nowrap">{order.orderNumber}</td>
                      <td className="px-4 py-3.5 text-sm">
                        <div className="text-kavox-black font-medium">{order.user?.firstName} {order.user?.lastName}</div>
                        <div className="text-xs text-kavox-gray">{order.user?.phone}</div>
                      </td>
                      <td className="px-4 py-3.5 text-sm font-semibold whitespace-nowrap">₹{fmt(order.totalAmount)}</td>
                      <td className="px-4 py-3.5 text-sm text-green-600 font-semibold whitespace-nowrap">₹{fmt(order.totalProfit || 0)}</td>
                      <td className="px-4 py-3.5"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PAY_BADGE[order.paymentStatus] || 'bg-gray-100 text-gray-600'}`}>{order.paymentStatus}</span></td>
                      <td className="px-4 py-3.5"><span className={`${STATUS_COLORS[order.status] || 'status-pending'} text-xs`}>{STATUS_LABELS[order.status] || order.status}</span></td>
                      <td className="px-4 py-3.5">
                        {order.qikinkFulfillmentStatus
                          ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${QK_BADGE[order.qikinkFulfillmentStatus] || 'bg-gray-100 text-gray-600'}`}>{order.qikinkFulfillmentStatus}</span>
                          : <span className="text-xs text-kavox-gray">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-kavox-gray whitespace-nowrap">{new Date(order.createdAt).toLocaleDateString('en-IN')}</td>
                      <td className="px-4 py-3.5 text-xs">
                        {order.status === 'confirmed' && <button onClick={() => handleOrderStatus(order._id, 'processing')} className="text-kavox-accent hover:underline whitespace-nowrap font-medium">→ Process</button>}
                        {order.status === 'processing' && <button onClick={() => handleOrderStatus(order._id, 'packed')} className="text-kavox-accent hover:underline whitespace-nowrap font-medium">→ Pack</button>}
                        {order.status === 'packed' && <button onClick={() => handleOrderStatus(order._id, 'shipped')} className="text-kavox-accent hover:underline whitespace-nowrap font-medium">→ Ship</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {orderMeta.pages > 1 && (
              <div className="px-6 py-4 border-t border-kavox-border flex items-center justify-between">
                <p className="text-xs text-kavox-gray">{orderMeta.total} orders</p>
                <div className="flex gap-2">
                  <button onClick={() => setOrderPage((p) => Math.max(1, p-1))} disabled={orderPage === 1} className="px-3 py-1.5 text-xs border border-kavox-border rounded-sm disabled:opacity-40 hover:bg-kavox-sand transition">Prev</button>
                  <span className="px-3 py-1.5 text-xs text-kavox-gray">{orderPage}/{orderMeta.pages}</span>
                  <button onClick={() => setOrderPage((p) => Math.min(orderMeta.pages, p+1))} disabled={orderPage >= orderMeta.pages} className="px-3 py-1.5 text-xs border border-kavox-border rounded-sm disabled:opacity-40 hover:bg-kavox-sand transition">Next</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ PRODUCTS TAB ══ */}
        {activeTab === 'products' && (
          <div className="space-y-5">
            {/* Margin Setter */}
            <div className="bg-white rounded-sm border border-kavox-border p-6">
              <h2 className="font-bold text-kavox-black mb-1 flex items-center gap-2"><Settings className="w-4 h-4" /> Set Profit Margin by Category</h2>
              <p className="text-xs text-kavox-gray font-light mb-4">Selling price = base_cost ÷ (1 − margin%). Overwrites existing selling prices for the selected category.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <select value={marginCategory} onChange={(e) => setMarginCategory(e.target.value)} className="flex-1 text-sm border border-kavox-border rounded-sm px-3 py-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-kavox-black">
                  <option value="">Select category…</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="flex items-center gap-2">
                  <input type="number" value={marginPercent} onChange={(e) => setMarginPercent(e.target.value)} placeholder="Margin" min={1} max={99} className="w-24 text-sm border border-kavox-border rounded-sm px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-kavox-black" />
                  <span className="text-sm text-kavox-gray font-medium">%</span>
                </div>
                <button onClick={handleSetMargin} disabled={settingMargin || !marginCategory || !marginPercent} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
                  {settingMargin ? 'Applying…' : 'Apply Margin'}
                </button>
              </div>
              {marginCategory && marginPercent && !isNaN(parseFloat(marginPercent)) && (
                <p className="text-xs text-kavox-gray mt-2 bg-kavox-cream px-3 py-2 rounded-sm">
                  Example: base cost ₹400 at {marginPercent}% margin → selling price <strong>₹{(400 / (1 - parseFloat(marginPercent) / 100)).toFixed(0)}</strong>
                </p>
              )}
            </div>

            {/* Products Table */}
            <div className="bg-white rounded-sm border border-kavox-border overflow-hidden">
              <div className="px-6 py-4 border-b border-kavox-border flex items-center justify-between">
                <h2 className="font-bold text-kavox-black">All Products</h2>
                <button onClick={loadProducts} className="btn-icon border border-kavox-border"><RefreshCw className={`w-4 h-4 ${productsLoading ? 'animate-spin' : ''}`} /></button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-kavox-cream">
                    <tr>{['Product','Category','Base Cost','Price','Margin','Stock','Status','POD','Action'].map((h) => <th key={h} className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-kavox-gray whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-kavox-border">
                    {productsLoading ? <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-kavox-gray">Loading…</td></tr>
                    : products.length === 0 ? <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-kavox-gray">No products</td></tr>
                    : products.map((p) => (
                      <tr key={p._id} className="hover:bg-kavox-cream/40 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5 max-w-[180px]">
                            <div className="w-8 h-10 bg-kavox-sand rounded flex-shrink-0 overflow-hidden">
                              <img src={p.images?.[0]?.url || '/placeholder.jpg'} alt={p.name} className="w-full h-full object-cover" />
                            </div>
                            <span className="text-sm font-medium text-kavox-black line-clamp-2">{p.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-kavox-gray">{p.category}</td>
                        <td className="px-4 py-3.5 text-sm text-orange-600 font-medium">₹{fmt(p.basePrice)}</td>
                        <td className="px-4 py-3.5 text-sm font-semibold">₹{fmt(p.sellingPrice)}</td>
                        <td className="px-4 py-3.5">
                          <span className={`text-xs font-semibold ${(p.margin||0) >= 30 ? 'text-green-600' : (p.margin||0) >= 15 ? 'text-amber-600' : 'text-red-500'}`}>{p.margin || 0}%</span>
                        </td>
                        <td className="px-4 py-3.5 text-sm">{p.isPOD ? '∞' : (p.totalStock ?? 0)}</td>
                        <td className="px-4 py-3.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.status === 'active' ? 'bg-green-50 text-green-700' : p.status === 'pending_review' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{p.status}</span>
                        </td>
                        <td className="px-4 py-3.5 text-center">{p.isPOD ? <span className="text-purple-600 text-xs font-bold">POD</span> : <span className="text-kavox-gray text-xs">—</span>}</td>
                        <td className="px-4 py-3.5">
                          <button onClick={() => handleDeleteProduct(p._id, p.name)} className="text-xs text-red-500 hover:text-red-700 hover:underline">Archive</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ QIKINK TAB ══ */}
        {activeTab === 'qikink' && (
          <div className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-sm border border-kavox-border p-6">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center flex-shrink-0"><RefreshCw className="w-5 h-5" /></div>
                  <div>
                    <h3 className="font-bold text-kavox-black">Sync Product Catalog</h3>
                    <p className="text-xs text-kavox-gray font-light mt-0.5">Pull base prices, sizes, and colors from Qikink into MongoDB.</p>
                  </div>
                </div>
                <button onClick={handleSyncQikink} disabled={syncing} className="btn-primary w-full py-2.5 text-sm disabled:opacity-40 flex items-center justify-center gap-2">
                  {syncing ? <><RefreshCw className="w-4 h-4 animate-spin" />Syncing…</> : '🔄 Sync Catalog Now'}
                </button>
              </div>
              <div className="bg-white rounded-sm border border-kavox-border p-6">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center flex-shrink-0"><Zap className="w-5 h-5" /></div>
                  <div>
                    <h3 className="font-bold text-kavox-black">Poll Order Statuses</h3>
                    <p className="text-xs text-kavox-gray font-light mt-0.5">Fetch latest fulfillment status from Qikink for all active orders.</p>
                  </div>
                </div>
                <button onClick={handlePollQikink} disabled={polling} className="w-full py-2.5 text-sm border border-kavox-border rounded-sm hover:bg-kavox-sand transition disabled:opacity-40 flex items-center justify-center gap-2 font-medium">
                  {polling ? <><RefreshCw className="w-4 h-4 animate-spin" />Polling…</> : '📡 Poll All Orders'}
                </button>
              </div>
            </div>

            {/* Status Map */}
            <div className="bg-white rounded-sm border border-kavox-border p-6">
              <h3 className="font-bold text-kavox-black mb-4">Qikink → KAVOX Status Mapping</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { qk: 'new / processing', kx: 'Processing', desc: 'Order received, in queue' },
                  { qk: 'printing', kx: 'Processing', desc: 'Design being printed' },
                  { qk: 'printed', kx: 'Packed', desc: 'Print done, packing now' },
                  { qk: 'dispatched / shipped', kx: 'Shipped', desc: 'Handed over to courier' },
                  { qk: 'delivered', kx: 'Delivered', desc: 'Customer received it' },
                  { qk: 'cancelled / failed', kx: 'Cancelled', desc: 'Failed at Qikink' },
                ].map((row) => (
                  <div key={row.qk} className="p-3 bg-kavox-cream rounded-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono bg-white border border-kavox-border px-2 py-0.5 rounded text-purple-700">{row.qk}</span>
                      <span className="text-kavox-gray text-xs">→</span>
                      <span className="text-xs font-semibold text-kavox-black">{row.kx}</span>
                    </div>
                    <p className="text-xs text-kavox-gray mt-1">{row.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Live stats */}
            <div className="bg-white rounded-sm border border-kavox-border p-6">
              <h3 className="font-bold text-kavox-black mb-4 flex items-center gap-2"><BarChart2 className="w-4 h-4" /> Current Fulfillment</h3>
              {dashData?.qikinkStats?.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {dashData.qikinkStats.map((item: any) => (
                    <div key={item._id} className={`p-4 rounded-sm ${QK_BADGE[item._id] || 'bg-gray-50 text-gray-600'}`}>
                      <p className="text-2xl font-bold">{item.count}</p>
                      <p className="text-xs font-medium capitalize mt-0.5">{item._id || 'Not Submitted'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-kavox-gray font-light">No Qikink orders in this period. Make a paid POD order to see data here.</p>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
