import { useEffect, useState } from 'react';
import { Camera, Loader2, Trash2, Package as PackageIcon, X, AlertCircle, ImageOff } from 'lucide-react';
import { supabase, PACKAGING_BUCKET } from '../lib/supabase';
import { uploadPhoto, signedUrl, deletePhoto } from '../lib/photos';
import type { Order, PackagingPhoto } from '../types';

export default function PackagingView() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [photos, setPhotos] = useState<PackagingPhoto[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('orders')
      .select('id, customer_name, tracking_number, created_at')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) console.error(error);
        setOrders((data as Order[]) ?? []);
        setLoading(false);
      });
  }, []);

  async function loadPhotos(order: Order) {
    setPhotos([]);
    setPhotoUrls({});
    const { data } = await supabase.from('packaging_photos').select('*').eq('order_id', order.id).order('taken_at', { ascending: true });
    const list = (data as PackagingPhoto[]) ?? [];
    setPhotos(list);
    const urls: Record<string, string> = {};
    await Promise.all(list.map(async (p) => {
      const u = await signedUrl(PACKAGING_BUCKET, p.storage_path);
      if (u) urls[p.id] = u;
    }));
    setPhotoUrls(urls);
  }

  useEffect(() => {
    if (activeOrder) loadPhotos(activeOrder);
  }, [activeOrder]);

  function capturePhoto() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !activeOrder) return;
      setError(null);
      setUploading(true);
      try {
        const path = await uploadPhoto(PACKAGING_BUCKET, file);
        const { data, error } = await supabase
          .from('packaging_photos')
          .insert({ order_id: activeOrder.id, storage_path: path })
          .select()
          .single();
        if (error) throw error;
        const newPhoto = data as PackagingPhoto;
        setPhotos((p) => [...p, newPhoto]);
        const url = await signedUrl(PACKAGING_BUCKET, path);
        if (url) setPhotoUrls((u) => ({ ...u, [newPhoto.id]: url }));
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setUploading(false);
      }
    };
    input.click();
  }

  async function removePhoto(photo: PackagingPhoto) {
    try {
      await deletePhoto(PACKAGING_BUCKET, photo.storage_path);
      await supabase.from('packaging_photos').delete().eq('id', photo.id);
      setPhotos((p) => p.filter((x) => x.id !== photo.id));
      setPhotoUrls((u) => {
        const next = { ...u };
        delete next[photo.id];
        return next;
      });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Packaging</h1>
        <p className="text-sm text-slate-500">Pick an order and capture the packing process.</p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {orders.map((o) => (
          <button
            key={o.id}
            onClick={() => setActiveOrder(o)}
            className={`card p-3 text-left transition ${activeOrder?.id === o.id ? 'border-blue-400 ring-1 ring-blue-400' : 'hover:border-blue-300'}`}
          >
            <div className="truncate text-sm font-semibold text-slate-900">{o.customer_name}</div>
            {o.tracking_number && <div className="truncate text-xs text-slate-500">{o.tracking_number}</div>}
          </button>
        ))}
      </div>

      {orders.length === 0 && (
        <div className="card p-8 text-center">
          <PackageIcon className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">Capture an order first.</p>
        </div>
      )}

      {activeOrder && (
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">{activeOrder.customer_name}</h2>
              <p className="text-xs text-slate-500">Capture packaging photos</p>
            </div>
            <button onClick={() => setActiveOrder(null)} className="btn-ghost h-8 px-2" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>

          <button onClick={capturePhoto} disabled={uploading} className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 px-4 py-6 text-blue-700 hover:bg-blue-100">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            <span className="text-sm font-semibold">{uploading ? 'Uploading…' : 'Take packaging photo'}</span>
          </button>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
            <ImageOff className="h-3.5 w-3.5" /> Photos are uploaded to the server only — not saved on this device.
          </p>

          {error && (
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /><span>{error}</span>
            </div>
          )}

          {photos.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photos.map((p) => (
                <div key={p.id} className="relative aspect-square overflow-hidden rounded-lg">
                  {photoUrls[p.id] && <img src={photoUrls[p.id]} alt="Packaging" className="h-full w-full object-cover" />}
                  <button
                    onClick={() => removePhoto(p)}
                    className="absolute right-1.5 top-1.5 rounded-lg bg-red-600 p-1.5 text-white shadow hover:bg-red-700"
                    aria-label="Delete photo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
