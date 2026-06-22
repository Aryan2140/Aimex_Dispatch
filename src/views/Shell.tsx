import { useEffect, useState } from 'react';
import { Package, Plus, List, Boxes, Camera, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../lib/auth';
import OrdersView from './OrdersView';
import NewOrderView from './NewOrderView';
import PackagingView from './PackagingView';
import AdminProductsView from './AdminProductsView';
import SettingsView from './SettingsView';

type Tab = 'orders' | 'new' | 'packaging' | 'products' | 'settings';

const TABS: { key: Tab; label: string; icon: typeof Package; adminOnly?: boolean }[] = [
  { key: 'orders', label: 'Orders', icon: List },
  { key: 'new', label: 'New', icon: Plus },
  { key: 'packaging', label: 'Packaging', icon: Camera },
  { key: 'products', label: 'Products', icon: Boxes, adminOnly: true },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export default function Shell() {
  const { profile, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('orders');

  useEffect(() => {
    if (tab === 'products' && profile?.role !== 'admin') setTab('orders');
  }, [profile, tab]);

  const isAdmin = profile?.role === 'admin';
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold leading-tight text-slate-900">Dispatch Capture</div>
              <div className="text-xs text-slate-500 leading-tight">{profile?.email}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && <span className="badge bg-blue-100 text-blue-700">Admin</span>}
            <button onClick={() => signOut()} className="btn-ghost h-9 px-2.5" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-4">
        {tab === 'orders' && <OrdersView onCreate={() => setTab('new')} />}
        {tab === 'new' && <NewOrderView onDone={() => setTab('orders')} />}
        {tab === 'packaging' && <PackagingView />}
        {tab === 'products' && isAdmin && <AdminProductsView />}
        {tab === 'settings' && <SettingsView />}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl">
          {visibleTabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition ${
                  active ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? 'stroke-[2.4]' : ''}`} />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
