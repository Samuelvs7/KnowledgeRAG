import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { WorkspaceLayout, type SidebarItem } from '../components/WorkspaceLayout';
import { AIDiagnosticsPanel, ContextChunksPanel } from '../components/AIDiagnosticsPanel';
import type { Product, InventoryAlert, PurchaseOrder, AIInfrastructureStatus, AIDiagnostics, ToolCall } from '../types';
import {
  Package,
  Search,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ShoppingCart,
  BarChart3,
  RefreshCw,
  CheckCircle,
  Plus,
  Cpu,
  Loader2,
  PackageCheck,
  AlertCircle,
  Send,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  verified: boolean;
}

interface DashboardStats {
  totalProducts: number;
  totalValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  categoryBreakdown: Record<string, number>;
}

export function ProductsPage() {
  const { user, session } = useAuth();
  const [activeView, setActiveView] = useState<'dashboard' | 'chat' | 'products' | 'orders' | 'alerts'>('dashboard');
  const [products, setProducts] = useState<Product[]>([]);
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [aiStatus, setAIStatus] = useState<AIInfrastructureStatus[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ totalProducts: 0, totalValue: 0, lowStockCount: 0, outOfStockCount: 0, categoryBreakdown: {} });
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [processing, setProcessing] = useState(false);
  const [diagnostics, setDiagnostics] = useState<AIDiagnostics | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [productsRes, alertsRes, ordersRes, statusRes] = await Promise.all([
        supabase.from('products').select('*').order('popularity_score', { ascending: false }),
        supabase.from('inventory_alerts').select('*, product:products(name)').order('created_at', { ascending: false }),
        supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }),
        supabase.from('ai_infrastructure_status').select('*'),
      ]);

      if (productsRes.data) {
        setProducts(productsRes.data);

        const totalValue = productsRes.data.reduce((sum, p) => sum + Number(p.price) * (p.stock_quantity || 0), 0);
        const lowStock = productsRes.data.filter(p => (p.stock_quantity || 0) <= (p.reorder_level || 10) && (p.stock_quantity || 0) > 0).length;
        const outOfStock = productsRes.data.filter(p => (p.stock_quantity || 0) === 0).length;
        const categories = productsRes.data.reduce((acc, p) => {
          acc[p.category] = (acc[p.category] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        setStats({
          totalProducts: productsRes.data.length,
          totalValue,
          lowStockCount: lowStock,
          outOfStockCount: outOfStock,
          categoryBreakdown: categories,
        });
      }

      if (alertsRes.data) setAlerts(alertsRes.data);
      if (ordersRes.data) setOrders(ordersRes.data);
      if (statusRes.data) setAIStatus(statusRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const authorizedJsonHeaders = () => {
    if (!session?.access_token) {
      throw new Error('Your session has expired. Please sign in again.');
    }
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    };
  };

  const handleQuerySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || processing || !user) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      verified: false,
    };

    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setProcessing(true);
    setDiagnostics(null);

    const startTime = Date.now();

    try {
      const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiBaseUrl}/api/products/query`, {
        method: 'POST',
        headers: authorizedJsonHeaders(),
        body: JSON.stringify({ query }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Inventory query failed');
      }

      const nextDiagnostics = data.diagnostics as AIDiagnostics;
      const toolCalls = nextDiagnostics.toolCalls || [];

      setDiagnostics(nextDiagnostics);

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.answer,
        toolCalls,
        verified: toolCalls.length > 0 && toolCalls.every(call => call.status === 'success'),
      }]);
      void fetchData();
    } catch (err) {
      console.error('Query error:', err);
      setDiagnostics({
        embeddingGenerated: false,
        embeddingModel: null,
        embeddingDimensions: null,
        embeddingTimeMs: null,
        vectorSearchPerformed: false,
        vectorSearchResults: 0,
        vectorSearchTimeMs: null,
        rerankerUsed: false,
        rerankerTimeMs: null,
        llmPromptTokens: null,
        llmCompletionTokens: null,
        llmTimeMs: null,
        totalTimeMs: Date.now() - startTime,
        contextChunks: [],
        toolCalls: [],
      });
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Error processing query. Please try again.',
        verified: false,
      }]);
    } finally {
      setProcessing(false);
    }
  };

  const sidebarItems: SidebarItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, active: activeView === 'dashboard', onClick: () => setActiveView('dashboard') },
    { id: 'chat', label: 'AI Inventory Agent', icon: Cpu, active: activeView === 'chat', onClick: () => setActiveView('chat') },
    { id: 'products', label: 'Products', icon: Package, active: activeView === 'products', onClick: () => setActiveView('products'), badge: stats.totalProducts },
    { id: 'orders', label: 'Purchase Orders', icon: ShoppingCart, active: activeView === 'orders', onClick: () => setActiveView('orders'), badge: orders.length },
    { id: 'alerts', label: 'Alerts', icon: AlertTriangle, active: activeView === 'alerts', onClick: () => setActiveView('alerts'), badge: alerts.filter(a => !a.acknowledged).length },
  ];

  const categories = ['all', ...new Set(products.map(p => p.category))];

  const filteredProducts = products.filter(p => {
    if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 text-emerald-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-white mb-2">Sign in Required</h2>
          <p className="text-slate-400 mb-6">Access inventory management</p>
          <a href="/profile" className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl">Sign In</a>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceLayout
      title="StockQuery AI"
      subtitle="Inventory Intelligence"
      icon={Package}
      accentColor="bg-emerald-500"
      sidebarItems={sidebarItems}
    >
      {activeView === 'dashboard' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
                <span>Refreshing inventory data</span>
              </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <Package className="w-5 h-5 text-blue-400" />
                  <span className="text-xs text-slate-500">Total Items</span>
                </div>
                <div className="text-3xl font-bold text-white">{stats.totalProducts}</div>
                <div className="text-xs text-slate-500 mt-1">active products</div>
              </div>

              <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs text-slate-500">Total Value</span>
                </div>
                <div className="text-3xl font-bold text-white">${(stats.totalValue / 1000).toFixed(1)}K</div>
                <div className="text-xs text-slate-500 mt-1">inventory value</div>
              </div>

              <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  <span className="text-xs text-slate-500">Low Stock</span>
                </div>
                <div className="text-3xl font-bold text-amber-400">{stats.lowStockCount}</div>
                <div className="text-xs text-slate-500 mt-1">below reorder level</div>
              </div>

              <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <TrendingDown className="w-5 h-5 text-red-400" />
                  <span className="text-xs text-slate-500">Out of Stock</span>
                </div>
                <div className="text-3xl font-bold text-red-400">{stats.outOfStockCount}</div>
                <div className="text-xs text-slate-500 mt-1">need restock</div>
              </div>
            </div>

            {/* Category Breakdown & AI Status */}
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                <h3 className="text-sm font-semibold text-white mb-4">Category Breakdown</h3>
                <div className="space-y-3">
                  {Object.entries(stats.categoryBreakdown).map(([cat, count]) => (
                    <div key={cat}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-slate-300">{cat}</span>
                        <span className="text-slate-500">{count} items</span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${(count / stats.totalProducts) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                <h3 className="text-sm font-semibold text-white mb-4">AI Infrastructure Status</h3>
                <div className="space-y-3">
                  {aiStatus.map(status => (
                    <div key={status.component} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          status.status === 'online' ? 'bg-emerald-500' :
                          status.status === 'degraded' ? 'bg-amber-500' :
                          status.status === 'offline' ? 'bg-red-500' : 'bg-slate-500'
                        }`} />
                        <span className="text-sm text-slate-300 capitalize">{status.component.replace('_', ' ')}</span>
                      </div>
                      <span className="text-xs text-slate-500">{status.latency_ms ? `${status.latency_ms}ms` : '--'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Alerts */}
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
              <h3 className="text-sm font-semibold text-white mb-4">Recent Alerts</h3>
              <div className="space-y-3">
                {(alerts as any[]).slice(0, 4).map(alert => (
                  <div key={alert.id} className="flex items-center gap-3 p-3 bg-slate-900 rounded-lg">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      alert.alert_type === 'out_of_stock' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-white">{(alert as any).product?.name || 'Unknown Product'}</div>
                      <div className="text-xs text-slate-500">{alert.alert_type.replace('_', ' ')}</div>
                    </div>
                    <span className="text-xs text-slate-500">{new Date(alert.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeView === 'chat' && (
        <div className="flex-1 grid grid-cols-3 overflow-hidden">
          {/* Chat Area */}
          <div className="col-span-2 flex flex-col border-r border-slate-800">
            <div className="h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4">
              <Cpu className="w-5 h-5 text-emerald-400 mr-2" />
              <span className="text-white font-medium">AI Inventory Agent</span>
              <div className="ml-auto flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-slate-500">Active</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Cpu className="w-12 h-12 text-emerald-500 mb-3" />
                  <h3 className="text-lg font-medium text-slate-300 mb-2">AI Inventory Agent</h3>
                  <p className="text-sm text-slate-500 max-w-sm mb-4">
                    Ask about inventory, stock levels, alerts, or product availability. All responses use verified inventory tools.
                  </p>
                  <div className="flex flex-wrap gap-2 max-w-md justify-center">
                    {['What\'s running low?', 'Inventory value?', 'Show alerts'].map(q => (
                      <button key={q} onClick={() => setQuery(q)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] ${msg.role === 'user' ? '' : 'space-y-2'}`}>
                      <div className={`rounded-2xl px-4 py-3 ${
                        msg.role === 'user' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-200'
                      }`}>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="space-y-2 mt-2">
                          {msg.toolCalls.map((tc, i) => (
                            <div key={i} className="bg-slate-900 rounded-lg p-3 border border-slate-700 text-xs">
                              <div className="flex items-center gap-2 mb-2">
                                <RefreshCw className="w-3 h-3 text-primary-400" />
                                <span className="text-primary-400 font-mono">{tc.tool}</span>
                                <span className="text-slate-500">{tc.execution_time_ms}ms</span>
                                {tc.status === 'success' ? (
                                  <CheckCircle className="w-3 h-3 text-success-500 ml-auto" />
                                ) : (
                                  <AlertCircle className="w-3 h-3 text-error-500 ml-auto" />
                                )}
                              </div>
                              <pre className="text-slate-500 overflow-x-auto">{JSON.stringify(tc.output, null, 2)}</pre>
                            </div>
                          ))}
                        </div>
                      )}
                      {msg.verified && (
                        <div className="flex items-center gap-1 text-xs text-success-400 mt-1">
                          <CheckCircle className="w-3 h-3" />
                          <span>Verified via inventory tools</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {processing && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
                      <span className="text-sm text-slate-400">Checking inventory...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleQuerySubmit} className="p-4 border-t border-slate-800 bg-slate-900">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Ask about inventory, stock levels, alerts..."
                  className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={processing}
                />
                <button
                  type="submit"
                  disabled={!query.trim() || processing}
                  className="px-5 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>
          </div>

          {/* Right Panel */}
          <div className="flex flex-col overflow-y-auto bg-slate-900 p-4 space-y-4">
            <AIDiagnosticsPanel diagnostics={diagnostics} isProcessing={processing} />
            {diagnostics?.contextChunks && diagnostics.contextChunks.length > 0 && (
              <ContextChunksPanel chunks={diagnostics.contextChunks} />
            )}
          </div>
        </div>
      )}

      {activeView === 'products' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Filters */}
          <div className="h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat === 'all' ? 'All Categories' : cat}</option>
              ))}
            </select>
          </div>

          {/* Products Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-3 gap-4">
              {filteredProducts.map(product => {
                const stockStatus = (product.stock_quantity || 0) === 0 ? 'out' : (product.stock_quantity || 0) <= (product.reorder_level || 10) ? 'low' : 'ok';

                return (
                  <div
                    key={product.id}
                    className="bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                        <Package className="w-5 h-5 text-emerald-400" />
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        stockStatus === 'ok' ? 'bg-emerald-500/20 text-emerald-400' :
                        stockStatus === 'low' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {stockStatus === 'ok' ? 'In Stock' : stockStatus === 'low' ? 'Low Stock' : 'Out of Stock'}
                      </span>
                    </div>
                    <h3 className="text-sm font-medium text-white mb-1">{product.name}</h3>
                    <p className="text-xs text-slate-500 mb-2">{product.category}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-white">${product.price}</span>
                      <span className="text-xs text-slate-500">{product.stock_quantity || 0} units</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeView === 'orders' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Purchase Orders</h2>
              <button className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm">
                <Plus className="w-4 h-4" />
                New Order
              </button>
            </div>

            {orders.length === 0 ? (
              <div className="bg-slate-800 rounded-xl p-12 text-center border border-slate-700">
                <ShoppingCart className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No purchase orders yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map(order => (
                  <div key={order.id} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-white">#{order.order_number}</div>
                        <div className="text-xs text-slate-500">{order.supplier || 'Unknown supplier'}</div>
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-1 rounded text-xs ${
                          order.status === 'received' ? 'bg-emerald-500/20 text-emerald-400' :
                          order.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-slate-700 text-slate-400'
                        }`}>
                          {order.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeView === 'alerts' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl font-bold text-white mb-6">Inventory Alerts</h2>

            {(alerts as any[]).length === 0 ? (
              <div className="bg-slate-800 rounded-xl p-12 text-center border border-slate-700">
                <PackageCheck className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <p className="text-slate-400">No active alerts</p>
                <p className="text-xs text-slate-500 mt-1">All inventory levels are healthy</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(alerts as any[]).map(alert => (
                  <div key={alert.id} className="bg-slate-800 rounded-xl p-4 border border-slate-700 flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      alert.alert_type === 'out_of_stock' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">{alert.product?.name || 'Unknown Product'}</div>
                      <div className="text-xs text-slate-500">{alert.message || alert.alert_type.replace('_', ' ')}</div>
                    </div>
                    <button className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs">
                      View
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </WorkspaceLayout>
  );
}
