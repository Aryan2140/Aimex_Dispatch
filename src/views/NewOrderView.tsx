import { useEffect, useMemo, useState } from 'react';
import {
  Camera, Trash2, Check, Search, Plus, Minus, Truck, ImageOff, AlertCircle, Loader2, ScanLine, Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import { uploadLabelPhoto } from '../lib/photos';
import { detectProviderFromTracking } from '../lib/carrierDetect';
import { trackShipment, isConfiguredNote, type TrackResult } from '../lib/carrierTrack';
import { parseLabel, type ParsedLabel } from '../lib/labelParse';
import { runOcr } from '../lib/ocr';
import type { DispatchProvider, Product, OrderItem } from '../types';

type DraftItem = { product_id: string | null; name: string; sku: string | null; quantity: number };

export default function NewOrderView({ onDone }: { onDone: () => void }) {
  const [providers, setProviders] = useState<DispatchProvider[]>([]);
  const [providerId, setProviderId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [notes, setNotes] = useState('');

  const [labelBlob, setLabelBlob] = useState<Blob | null>(null);
  const [labelPreview, setLabelPreview] = useState<string | null>(null);

  const [items, setItems] = useState<DraftItem[]>([{ product_id: null, name: '', sku: null, quantity: 1 }]);
  const [track, setTrack] = useState<TrackResult | null>(null);
  const [trackBusy, setTrackBusy] = useState(false);

  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [parsed, setParsed] = useState<ParsedLabel | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.providers.list().then(setProviders).catch(console.error);
  }, []);

  useEffect(() => {
    if (!trackingNumber || providerId) return;
    const key = detectProviderFromTracking(trackingNumber);
    if (!key) return;
    const match = providers.find((p) => p.key === key);
    if (match) setProviderId(String(match.id));
  }, [trackingNumber, providers, providerId]);

  const canSave = useMemo(
    () => customerName.trim() && customerAddress.trim() && providerId && items.every((i) => i.name.trim() && i.quantity > 0),
    [customerName, customerAddress, providerId, items],
  );

  function captureFromCamera() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      setLabelPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
      setLabelBlob(file);
    };
    input.click();
  }

  function clearPhoto() {
    if (labelPreview) URL.revokeObjectURL(labelPreview);
    setLabelPreview(null);
    setLabelBlob(null);
    setParsed(null);
    setOcrProgress(0);
  }

  async function readLabel() {
    if (!labelBlob) return;
    setError(null);
    setParsed(null);
    setOcrBusy(true);
    setOcrProgress(0);
    try {
      const ocr = await runOcr(labelBlob, (p) => setOcrProgress(p));
      const result = parseLabel(ocr);
      setParsed(result);
      if (result.trackingNumber && !trackingNumber) setTrackingNumber(result.trackingNumber);
      if (result.carrierKey && !providerId) {
        const match = providers.find((p) => p.key === result.carrierKey);
        if (match) setProviderId(String(match.id));
      }
      if (result.name && !customerName) setCustomerName(result.name);
      if (result.addressLines.length > 0 && !customerAddress) setCustomerAddress(result.addressLines.join(', '));
      if (result.phone && !customerPhone) setCustomerPhone(result.phone);
    } catch (err) {
      setError(`Could not read label: ${(err as Error).message}`);
    } finally {
      setOcrBusy(false);
    }
  }

  async function lookupTracking() {
    setError(null);
    setTrack(null);
    if (!trackingNumber.trim()) return;
    const carrier = providers.find((p) => String(p.id) === providerId)?.key ?? '';
    if (carrier !== 'australia_post' && carrier !== 'couriers_please') {
      const provName = providers.find((p) => String(p.id) === providerId)?.name ?? carrier;
      setTrack({
        carrier: provName,
        trackingNumber,
        status: null,
        events: [],
        note: 'Tracking lookup is only available for Australia Post and Couriers Please.',
      });
      return;
    }
    setTrackBusy(true);
    try {
      setTrack(await trackShipment(carrier, trackingNumber.trim()));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTrackBusy(false);
    }
  }

  function addItem() {
    setItems((p) => [...p, { product_id: null, name: '', sku: null, quantity: 1 }]);
  }
  function removeItem(idx: number) {
    setItems((p) => p.filter((_, i) => i !== idx));
  }
  function patchItem(idx: number, patch: Partial<DraftItem>) {
    setItems((p) => p.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function save() {
    setError(null);
    if (!canSave) return;
    setSaving(true);
    try {
      const labelPhotoPath = labelBlob ? await uploadLabelPhoto(labelBlob) : null;
      const payload = {
        customer_name: customerName.trim(),
        customer_address: customerAddress.trim(),
        customer_phone: customerPhone.trim() || null,
        customer_email: null,
        dispatch_provider_id: providerId ? Number(providerId) : null,
        tracking_number: trackingNumber.trim() || null,
        carrier_status_text: track?.status || null,
        label_photo_path: labelPhotoPath,
        notes: notes.trim() || null,
        status: 'captured' as const,
        order_items: items.map((item) => ({
          product_id: item.product_id ? Number(item.product_id) : null,
          name: item.name.trim(),
          sku: item.sku,
          quantity: item.quantity,
        })),
      };

      await api.orders.create(payload);
      if (labelPreview) URL.revokeObjectURL(labelPreview);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">New order</h1>
        <p className="text-sm text-slate-500">Capture a shipping order from a label or by manual entry.</p>
      </div>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Shipping label photo</h2>
        {labelPreview ? (
          <div className="space-y-3">
            <div className="relative">
              <img src={labelPreview} alt="Captured label" className="w-full rounded-lg" />
              <button onClick={clearPhoto} className="absolute right-2 top-2 rounded-lg bg-red-600 p-2 text-white shadow" aria-label="Remove photo">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <button onClick={readLabel} disabled={ocrBusy} className="btn-secondary w-full">
              {ocrBusy ? (<><Loader2 className="h-4 w-4 animate-spin" /> Reading label… {Math.round(ocrProgress * 100)}%</>) : (<><ScanLine className="h-4 w-4" /> Read label &amp; auto-fill</>)}
            </button>
            {ocrBusy && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.round(ocrProgress * 100)}%` }} />
              </div>
            )}
            {parsed && !ocrBusy && (
              <div className="flex items-start gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>Label read — please verify the fields below before saving.</span>
              </div>
            )}
          </div>
        ) : (
          <button onClick={captureFromCamera} className="flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-slate-500 hover:border-blue-400 hover:text-blue-600">
            <Camera className="mb-2 h-7 w-7" />
            <span className="text-sm font-medium">Take a photo of the label</span>
            <span className="mt-0.5 text-xs text-slate-400">Capture a clear, well-lit label — we'll OCR it on-device.</span>
          </button>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
          <ImageOff className="h-3.5 w-3.5" /> Photos upload to the server only — not saved on your device. OCR runs entirely in your browser.
        </p>
      </section>

      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Carrier &amp; tracking</h2>
        </div>
        <div>
          <label className="label" htmlFor="provider">Dispatched by</label>
          <select id="provider" className="input" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
            <option value="">Select carrier…</option>
            {providers.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tracking">Tracking / consignment number</label>
          <div className="flex gap-2">
            <input id="tracking" className="input" value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="e.g. AB123456789AU or CP1234567" />
            <button onClick={lookupTracking} disabled={trackBusy || !trackingNumber.trim()} className="btn-secondary shrink-0">
              {trackBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              Look up
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">Carrier is auto-detected from the number format.</p>
        </div>
        {track && (
          <div className={`rounded-lg p-3 text-sm ${isConfiguredNote(track.note) ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-800'}`}>
            {track.status && <div className="font-semibold">Status: {track.status}</div>}
            {track.receiverSuburb && <div className="text-xs">Receiver suburb: {track.receiverSuburb}</div>}
            {track.note && <div className="mt-1 flex items-start gap-1.5 text-xs"><AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /><span>{track.note}</span></div>}
          </div>
        )}
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Customer details</h2>
        <div>
          <label className="label" htmlFor="cname">Customer name *</label>
          <input id="cname" className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Jane Smith" />
        </div>
        <div>
          <label className="label" htmlFor="caddr">Address *</label>
          <textarea id="caddr" className="input" rows={2} value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="12 Main St, Brunswick VIC 3056" />
        </div>
        <div>
          <label className="label" htmlFor="cphone">Phone</label>
          <input id="cphone" className="input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="04xx xxx xxx" />
        </div>
      </section>

      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Order items</h2>
          <button onClick={addItem} className="btn-ghost h-8 px-2 text-xs"><Plus className="h-4 w-4" /> Add</button>
        </div>
        {items.map((it, idx) => (
          <ProductRow
            key={idx}
            value={it}
            onChange={(patch) => patchItem(idx, patch)}
            onRemove={() => removeItem(idx)}
            canRemove={items.length > 1}
          />
        ))}
        {!items.length && <p className="text-sm text-slate-400">Add at least one item.</p>}
      </section>

      <section className="card p-4">
        <label className="label" htmlFor="notes">Notes</label>
        <textarea id="notes" className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note…" />
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="sticky bottom-16 flex gap-2">
        <button onClick={() => onDone()} className="btn-secondary flex-1">Cancel</button>
        <button onClick={save} disabled={!canSave || saving} className="btn-primary flex-[2]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save order'}
        </button>
      </div>
    </div>
  );
}

function ProductRow({
  value, onChange, onRemove, canRemove,
}: {
  value: DraftItem;
  onChange: (patch: Partial<DraftItem>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [query, setQuery] = useState(value.name);
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [blurTimeout, setBlurTimeout] = useState<number | null>(null);

  useEffect(() => {
    setQuery(value.name);
  }, [value.name]);

  async function runSearch(q: string) {
    setQuery(q);
    onChange({ name: q, product_id: null, sku: null });
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      setResults(await api.products.list(q.trim()));
    } catch (err) {
      console.error(err);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function pick(p: Product) {
    setQuery(p.name);
    onChange({ name: p.name, product_id: String(p.id), sku: p.sku });
    setResults([]);
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search product…"
            value={query}
            onChange={(e) => runSearch(e.target.value)}
            onFocus={() => { if (blurTimeout) clearTimeout(blurTimeout); }}
            onBlur={() => setBlurTimeout(window.setTimeout(() => setResults([]), 180))}
          />
          {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
        </div>
        {results.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                  className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-blue-50"
                >
                  <span className="text-sm font-medium text-slate-900">{p.name}</span>
                  {p.sku && <span className="text-xs text-slate-500">SKU: {p.sku}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onChange({ quantity: Math.max(1, value.quantity - 1) })} className="btn-ghost h-9 w-9 p-0" aria-label="Decrease"><Minus className="h-4 w-4" /></button>
          <input
            type="number"
            min={1}
            className="input w-16 text-center"
            value={value.quantity}
            onChange={(e) => onChange({ quantity: Math.max(1, Number(e.target.value) || 1) })}
          />
          <button type="button" onClick={() => onChange({ quantity: value.quantity + 1 })} className="btn-ghost h-9 w-9 p-0" aria-label="Increase"><Plus className="h-4 w-4" /></button>
        </div>
        {canRemove && (
          <button type="button" onClick={onRemove} className="ml-auto btn-ghost h-9 px-2 text-red-600 hover:bg-red-50" aria-label="Remove item"><Trash2 className="h-4 w-4" /></button>
        )}
      </div>
    </div>
  );
}

export type { DraftItem, OrderItem };
