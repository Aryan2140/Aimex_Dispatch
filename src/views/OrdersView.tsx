import { useEffect, useState } from 'react';
import { Plus, Loader2, Search, ChevronRight, Package as PackageIcon, Truck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { signedUrl } from '../lib/photos';
import type { Order, DispatchProvider } from '../types';

export default function OrdersView({ onCreate }: { onCreate: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [providers, setProviders] = useState<DispatchProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);

  useEffect(() => {
    supabase.from('dispatch_providers').select('*').order('sort_order').then(({ data }) => {
      setProviders((data as DispatchProvider[]) ?? []);
    });
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .from('orders')
      .select('*, order_items(*), dispatch_providers(*)')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.error(error);
        setOrders((data as Order[]) ?? []);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const filtered = q.trim()
    ? orders.filter((o) =>
        [o.customer_name, o.tracking_number, o.customer_address].join(' ').toLowerCase().includes(q.toLowerCase()))
    : orders;

  function providerName(id: string | null) {
    if (!id) return 'Unknown';
    return providers.find((p) => p.id === id)?.name ?? 'Unknown';
  }

  function statusColor(s: Order['status']) {
    switch (s) {
      case 'captured': return 'bg-blue-100 text-blue-700';
      case 'packed': return 'bg-amber-100 text-amber-700';
      case 'dispatched': return 'bg-emerald-100 text-emerald-700';
      case 'cancelled': return 'bg-slate-100 text-slate-600';
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Orders</h1>
        <button onClick={onCreate} className="btn-primary"><Plus className="h-4 w-4" /> New</button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Search customer, tracking, address…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <PackageIcon className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">No orders yet. Tap “New” to capture one.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((o) => (
            <li key={o.id}>
              <button
                onClick={() => setSelected(o)}
                className="card w-full p-3 text-left hover:border-blue-300 hover:shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{o.customer_name}</div>
                    <div className="truncate text-xs text-slate-500">{providerName(o.dispatch_provider_id)}</div>
                    {o.tracking_number && (
                      <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-400">
                        <Truck className="h-3 w-3" /> {o.tracking_number}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`badge ${statusColor(o.status)}`}>{o.status}</span>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <OrderDetailModal order={selected} providerName={providerName(selected.dispatch_provider_id)} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function OrderDetailModal({
  order, providerName, onClose,
}: { order: Order; providerName: string; onClose: () => void }) {
  const [labelUrl, setLabelUrl] = useState<string | null>(null);

  useEffect(() => {
    if (order.label_photo_path) signedUrl('label-photos', order.label_photo_path).then(setLabelUrl);
  }, [order.label_photo_path]);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{order.customer_name}</h2>
              <p className="text-xs text-slate-500">{new Date(order.created_at).toLocaleString()}</p>
            </div>
            <button onClick={onClose} className="btn-ghost h-8 px-3 text-xs">Close</button>
          </div>
        </div>
        <div className="space-y-4 p-4 text-sm">
          {labelUrl && (
            <div>
              <img src={labelUrl} alt="Label" className="w-full rounded-lg" />
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1 text-slate-500">Carrier</div>
            <div className="col-span-2 font-medium">{providerName}</div>
            <div className="col-span-1 text-slate-500">Tracking</div>
            <div className="col-span-2 font-medium">{order.tracking_number ?? '—'}</div>
            {order.carrier_status_text && (
              <>
                <div className="col-span-1 text-slate-500">Status</div>
                <div className="col-span-2 font-medium">{order.carrier_status_text}</div>
              </>
            )}
            <div className="col-span-1 text-slate-500">Address</div>
            <div className="col-span-2 whitespace-pre-line font-medium">{order.customer_address}</div>
            {order.customer_phone && (
              <>
                <div className="col-span-1 text-slate-500">Phone</div>
                <div className="col-span-2 font-medium">{order.customer_phone}</div>
              </>
            )}
          </div>
          <div>
            <div className="label">Items</div>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {order.order_items?.map((it) => (
                <li key={it.id} className="flex items-center justify-between px-3 py-2">
                  <span className="font-medium">{it.name}</span>
                  <span className="text-slate-600">× {it.quantity}</span>
                </li>
              ))}
            </ul>
          </div>
          {order.notes && (
            <div>
              <div className="label">Notes</div>
              <p className="whitespace-pre-line text-slate-700">{order.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
