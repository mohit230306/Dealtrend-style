import { useCallback, useEffect, useState } from 'react';
import {
  ClipboardList,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  LogOut,
  MessageSquare,
  Package,
  Settings,
} from 'lucide-react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { OfflineIndicator } from '../components/OfflineIndicator';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { StoreLogo } from '../components/StoreLogo';
import {
  auth,
  AUTHORIZED_ADMIN_EMAIL,
  testFirestoreConnection,
} from '../lib/firebase';
import {
  buildAppsScriptOrderPayload,
  computeDashboardMetrics,
  ensureFirestoreSeeded,
  loadAdminProductsFromFirestore,
  loadAdminSettingsFromFirestore,
  loadAndEnrichOrdersFromFirestore,
  loadCancelRequestsFromFirestore,
  loadReturnRequestsFromFirestore,
  loadSupportMessagesFromFirestore,
  updateOrderStatusInFirestore,
} from '../lib/firestoreAdmin';
import type {
  AdminStoreSettings,
  CancelRequest,
  DashboardMetrics,
  Order,
  Product,
  ReturnRequest,
  SupportMessage,
} from '../types';
import { AdminDashboard } from './AdminDashboard';
import { AdminLogin } from './AdminLogin';
import { AdminOrders } from './AdminOrders';
import { AdminProducts } from './AdminProducts';
import { AdminSettings } from './AdminSettings';
import { AdminSupport } from './AdminSupport';

type AdminTab = 'dashboard' | 'products' | 'orders' | 'support' | 'settings';

export function AdminApp() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [unauthorizedEmail, setUnauthorizedEmail] = useState<string | null>(null);

  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [returnRequests, setReturnRequests] = useState<ReturnRequest[]>([]);
  const [cancelRequests, setCancelRequests] = useState<CancelRequest[]>([]);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [settings, setSettings] = useState<AdminStoreSettings | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState('');

  const syncWarmServerCache = useCallback(
    async (user: User, nextSettings: AdminStoreSettings, nextProducts: Product[]) => {
      try {
        const idToken = await user.getIdToken();
        await fetch('/api/admin/cache-refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            appsScriptUrl: nextSettings.appsScriptUrl,
            products: nextProducts.map((p) => ({
              id: p.id,
              sourcePrice: p.sourcePrice,
              sourceProductUrl: p.sourceProductUrl,
            })),
          }),
        });
      } catch {
        // non-blocking cache warm-up
      }
    },
    []
  );

  const loadAdminData = useCallback(
    async (userOverride?: User | null) => {
      const user = userOverride ?? auth.currentUser;
      if (!user) return;
      setLoadingData(true);
      setDataError('');
      try {
        await ensureFirestoreSeeded();
        const [loadedSettings, loadedProducts, loadedTickets, loadedReturns, loadedCancels] =
          await Promise.all([
            loadAdminSettingsFromFirestore(),
            loadAdminProductsFromFirestore(),
            loadSupportMessagesFromFirestore(),
            loadReturnRequestsFromFirestore(),
            loadCancelRequestsFromFirestore(),
          ]);
        const loadedOrders = await loadAndEnrichOrdersFromFirestore(loadedProducts);

        // Automatically sync any Pending/Not Configured orders (and retry orders that failed with old payload mismatch)
        let finalOrders = loadedOrders;
        const shouldAutoSync = (o: Order) =>
          o.appsScriptSyncStatus === 'Pending' ||
          o.appsScriptSyncStatus === 'Not Configured' ||
          (o.appsScriptSyncStatus === 'Failed' &&
            /name is required/i.test(o.appsScriptSyncMessage || ''));
        const pendingToSync = loadedSettings.appsScriptUrl
          ? loadedOrders.filter(shouldAutoSync)
          : [];
        if (pendingToSync.length > 0) {
          const idToken = await user.getIdToken();
          finalOrders = await Promise.all(
            loadedOrders.map(async (order) => {
              if (!shouldAutoSync(order)) return order;
              try {
                const res = await fetch('/api/admin/proxy-apps-script', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                  },
                  body: JSON.stringify({
                    url: loadedSettings.appsScriptUrl,
                    payload: buildAppsScriptOrderPayload(order),
                  }),
                });
                const data = (await res.json()) as {
                  ok?: boolean;
                  message?: string;
                  error?: string;
                };
                const nextStatus = data.ok ? ('Synced' as const) : ('Failed' as const);
                const nextMsg = data.message || data.error || 'Apps Script sync error';
                await updateOrderStatusInFirestore(order, {
                  appsScriptSyncStatus: nextStatus,
                  appsScriptSyncMessage: nextMsg,
                });
                return {
                  ...order,
                  appsScriptSyncStatus: nextStatus,
                  appsScriptSyncMessage: nextMsg,
                };
              } catch {
                return order;
              }
            })
          );
        }

        setSettings(loadedSettings);
        setProducts(loadedProducts);
        setOrders(finalOrders);
        setReturnRequests(loadedReturns);
        setCancelRequests(loadedCancels);
        setSupportMessages(loadedTickets);
        setMetrics(computeDashboardMetrics(finalOrders));

        await syncWarmServerCache(user, loadedSettings, loadedProducts);
      } catch (err) {
        setDataError(
          err instanceof Error ? err.message : 'Unable to load store data from Firebase Firestore.'
        );
      } finally {
        setLoadingData(false);
      }
    },
    [syncWarmServerCache]
  );

  useEffect(() => {
    document.title = 'DealTrend Admin Panel';
    void testFirestoreConnection();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const email = (user.email || '').toLowerCase();
        if (email === AUTHORIZED_ADMIN_EMAIL && user.emailVerified) {
          setCurrentUser(user);
          setUnauthorizedEmail(null);
          setCheckingAuth(false);
          void loadAdminData(user);
          return;
        }
        setCurrentUser(null);
        setUnauthorizedEmail(user.email || 'Unknown account');
        setCheckingAuth(false);
        return;
      }

      setCurrentUser(null);
      setUnauthorizedEmail(null);
      setCheckingAuth(false);
    });

    return () => unsubscribe();
  }, [loadAdminData]);

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentUser(null);
    setMetrics(null);
    setSettings(null);
    setProducts([]);
    setOrders([]);
    setReturnRequests([]);
    setCancelRequests([]);
    setSupportMessages([]);
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#0B3B6D]" />
      </div>
    );
  }

  if (!currentUser) {
    return <AdminLogin unauthorizedEmail={unauthorizedEmail} />;
  }

  const activeReturnsCount = returnRequests.filter(
    (r) => r.returnStatus !== 'Completed' && r.returnStatus !== 'Rejected'
  ).length;
  const pendingCancelsCount = cancelRequests.filter((c) => c.cancelStatus === 'Requested').length;
  const ordersAttentionBadge = activeReturnsCount + pendingCancelsCount;
  const supportAndReturnsBadge = supportMessages.length + activeReturnsCount;

  const navTabs: Array<{
    id: AdminTab;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: number;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'products', label: 'Products', icon: Package },
    {
      id: 'orders',
      label: 'Orders',
      icon: ClipboardList,
      badge: ordersAttentionBadge > 0 ? ordersAttentionBadge : undefined,
    },
    {
      id: 'support',
      label: 'Tickets',
      icon: MessageSquare,
      badge: supportAndReturnsBadge > 0 ? supportAndReturnsBadge : undefined,
    },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-white border-r border-[#E2E8F0] p-5 justify-between">
        <div className="space-y-8">
          <div className="space-y-1">
            <StoreLogo
              storeName={settings?.storeName || 'DealTrend Admin'}
              logoUrl={settings?.logoUrl}
              size="sm"
            />
            <p className="text-[11px] font-medium text-[#64748B] pl-9">Cloud Admin Console</p>
          </div>

          <nav className="space-y-1.5">
            {navTabs.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between gap-2 transition-colors ${
                    active
                      ? 'bg-[#0B3B6D] text-white'
                      : 'text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.badge !== undefined && (
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-md tabular-nums ${
                        active ? 'bg-white/20 text-white' : 'bg-[#0B3B6D]/10 text-[#0B3B6D]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-2 pt-4 border-t border-[#E2E8F0]">
          <PWAInstallButton variant="card" label="Install Admin App" />
          <a
            href="/"
            className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#0F172A] hover:bg-[#F8FAFC] flex items-center justify-between"
          >
            <span>Open Storefront</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="w-full min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-semibold text-[#991B1B] hover:bg-[#FEF2F2] flex items-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="lg:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E2E8F0] px-4 h-14 flex items-center justify-between">
        <StoreLogo
          storeName={`${settings?.storeName || 'DealTrend'} Admin`}
          logoUrl={settings?.logoUrl}
          size="sm"
        />
        <div className="flex items-center gap-2">
          <PWAInstallButton label="Install" />
          <a
            href="/"
            className="min-h-[38px] px-3 rounded-lg border border-[#E2E8F0] text-xs font-medium flex items-center gap-1"
          >
            <span>Store</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            type="button"
            onClick={() => void handleLogout()}
            aria-label="Sign out"
            className="min-h-[38px] min-w-[38px] rounded-lg text-[#991B1B] flex items-center justify-center"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 p-4 sm:p-8 pb-24 lg:pb-12 max-w-6xl w-full mx-auto">
        {dataError && (
          <div className="mb-6 p-4 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B]">
            {dataError}
          </div>
        )}

        {loadingData && !settings ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-[#0B3B6D]" />
          </div>
        ) : (
          <>
            {tab === 'dashboard' && (
              <AdminDashboard
                metrics={metrics}
                currencySymbol={settings?.currencySymbol || '₹'}
                openTicketsCount={supportMessages.length}
                onViewAllOrders={() => setTab('orders')}
                onViewTickets={() => setTab('support')}
              />
            )}
            {tab === 'products' && (
              <AdminProducts
                products={products}
                currencySymbol={settings?.currencySymbol || '₹'}
                onRefresh={() => loadAdminData(currentUser)}
              />
            )}
            {tab === 'orders' && (
              <AdminOrders
                orders={orders}
                returnRequests={returnRequests}
                cancelRequests={cancelRequests}
                appsScriptUrl={settings?.appsScriptUrl || ''}
                currencySymbol={settings?.currencySymbol || '₹'}
                onRefresh={() => loadAdminData(currentUser)}
              />
            )}
            {tab === 'support' && (
              <AdminSupport
                tickets={supportMessages}
                returnRequests={returnRequests}
                orders={orders}
                currencySymbol={settings?.currencySymbol || '₹'}
                onRefresh={() => loadAdminData(currentUser)}
                onViewOrders={() => setTab('orders')}
              />
            )}
            {tab === 'settings' && settings && (
              <AdminSettings
                settings={settings}
                adminEmail={currentUser.email || AUTHORIZED_ADMIN_EMAIL}
                onRefresh={() => loadAdminData(currentUser)}
              />
            )}
          </>
        )}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E2E8F0] pb-safe">
        <div className="grid grid-cols-5 h-14 items-center">
          {navTabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 ${
                  active ? 'text-[#0B3B6D] font-semibold' : 'text-[#475569]'
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {item.badge !== undefined && (
                    <span className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-[#C24D06] text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[11px] leading-none">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      <OfflineIndicator />
    </div>
  );
}
