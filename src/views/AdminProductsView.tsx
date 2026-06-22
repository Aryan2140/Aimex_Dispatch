import { useEffect, useState, type FormEvent } from 'react';
import { Boxes, Loader2, Plus, Search, Trash2, Pencil, X } from 'lucide-react';
import { api } from '../lib/api';
import type { Product } from '../types';

export default function AdminProductsView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setProducts(await api.products.list());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = q.trim()
    ? products.filter((p) => [p.name, p.sku ?? '', p.barcode ?? ''].join(' ').toLowerCase().includes(q.toLowerCase()))
    : products;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Products</h1>
          <p className="text-sm text-slate-500">Manage the catalogue available for order entry.</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary"><Plus className="h-4 w-4" /> Add</button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <Boxes className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">No products yet.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {filtered.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">{p.name}</div>
                <div className="truncate text-xs text-slate-500">{p.sku ? `SKU ${p.sku}` : 'No SKU'}{p.barcode ? ` · ${p.barcode}` : ''}</div>
              </div>
              <button onClick={() => setEditing(p)} className="btn-ghost h-8 px-2" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}

      {(creating || editing) && (
        <ProductModal
          product={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function ProductModal({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(product?.name ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [barcode, setBarcode] = useState(product?.barcode ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        sku: sku.trim() || null,
        barcode: barcode.trim() || null,
        description: description.trim() || null,
      };
      if (product) {
        await api.products.update(product.id, payload);
      } else {
        await api.products.create(payload);
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!product) return;
    setSaving(true);
    try {
      await api.products.delete(product.id);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onClick={onClose}>
      <div className="card w-full max-w-md rounded-t-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="text-lg font-bold text-slate-900">{product ? 'Edit product' : 'Add product'}</h2>
          <button onClick={onClose} className="btn-ghost h-8 px-2" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={submit} className="space-y-3 p-4">
          <div>
            <label className="label" htmlFor="pname">Name *</label>
            <input id="pname" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Wireless Mouse" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="psku">SKU</label>
              <input id="psku" className="input" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU-001" />
            </div>
            <div>
              <label className="label" htmlFor="pbar">Barcode</label>
              <input id="pbar" className="input" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="931..." />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="pdesc">Description</label>
            <textarea id="pdesc" className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="flex gap-2">
            {product && <button type="button" onClick={remove} disabled={saving} className="btn-danger"><Trash2 className="h-4 w-4" /></button>}
            <button type="submit" disabled={saving || !name.trim()} className="btn-primary flex-1">
              {saving ? 'Saving…' : product ? 'Save changes' : 'Add product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
