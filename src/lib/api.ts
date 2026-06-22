import type {
  DispatchProvider,
  Order,
  OrderItem,
  Product,
  Profile,
  PackagingPhoto,
} from '../types';

export type TrackResult = {
  carrier: string;
  trackingNumber: string;
  status: string | null;
  events: Array<{ status?: string; description?: string; location?: string; date?: string }>;
  receiverSuburb?: string | null;
  receiverPostcode?: string | null;
  note?: string;
};

const API_BASE = '/api';
const UPLOAD_BASE = 'http://localhost:3001/uploads';

async function request<T>(url: string, options: RequestInit = {}) {
  const init: RequestInit = {
    credentials: 'include',
    ...options,
  };

  if (init.body && !(init.body instanceof FormData)) {
    init.headers = {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    };
    init.body = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
  }

  const res = await fetch(url, init);
  if (!res.ok) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.message) errorMessage = data.message;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(errorMessage);
  }
  if (res.status === 204) {
    return null as unknown as T;
  }
  return (await res.json()) as T;
}

async function upload<T>(url: string, file: Blob) {
  const form = new FormData();
  form.append('photo', file);
  const res = await fetch(url, {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
  if (!res.ok) {
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.message) errorMessage = data.message;
    } catch {
      // ignore
    }
    throw new Error(errorMessage);
  }
  return (await res.json()) as T;
}

export const api = {
  auth: {
    me: () => request<Profile>(`${API_BASE}/auth/me`),
    signin: (email: string, password: string) => request<void>(`${API_BASE}/auth/signin`, { method: 'POST', body: { email, password } }),
    signup: (email: string, password: string) => request<void>(`${API_BASE}/auth/signup`, { method: 'POST', body: { email, password } }),
    signout: () => request<void>(`${API_BASE}/auth/signout`, { method: 'POST' }),
  },
  providers: {
    list: () => request<DispatchProvider[]>(`${API_BASE}/providers`),
  },
  orders: {
    list: (query?: string) => request<Order[]>(`${API_BASE}/orders${query ? `?q=${encodeURIComponent(query)}` : ''}`),
    get: (orderId: number | string) => request<Order>(`${API_BASE}/orders/${orderId}`),
    create: (payload: Omit<Order, 'id' | 'created_at' | 'updated_at' | 'order_items' | 'created_by'> & { order_items: Array<Pick<OrderItem, 'product_id' | 'name' | 'sku' | 'quantity'>> }) =>
      request<Order>(`${API_BASE}/orders`, { method: 'POST', body: payload }),
    update: (orderId: number | string, payload: Partial<Omit<Order, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'order_items'>>) =>
      request<Order>(`${API_BASE}/orders/${orderId}`, { method: 'PATCH', body: payload }),
  },
  products: {
    list: (query?: string) => request<Product[]>(`${API_BASE}/products${query ? `?q=${encodeURIComponent(query)}` : ''}`),
    create: (payload: { name: string; sku?: string | null; barcode?: string | null; description?: string | null }) =>
      request<Product>(`${API_BASE}/products`, { method: 'POST', body: payload }),
    update: (productId: number | string, payload: { name?: string; sku?: string | null; barcode?: string | null; description?: string | null }) =>
      request<Product>(`${API_BASE}/products/${productId}`, { method: 'PATCH', body: payload }),
    delete: (productId: number | string) => request<void>(`${API_BASE}/products/${productId}`, { method: 'DELETE' }),
  },
  photos: {
    uploadLabel: (file: Blob) => upload<{ path: string }>(`${API_BASE}/photos/label`, file).then((data) => data.path),
    uploadPackaging: (orderId: number | string, file: Blob) => upload<PackagingPhoto>(`${API_BASE}/photos/packaging/${orderId}`, file),
    listPackaging: (orderId: number | string) => request<PackagingPhoto[]>(`${API_BASE}/photos/packaging/${orderId}`),
    deletePackaging: (photoId: number | string) => request<void>(`${API_BASE}/photos/packaging/${photoId}`, { method: 'DELETE' }),
  },
  track: {
    shipment: (carrier: string, trackingNumber: string) => request<TrackResult>(`${API_BASE}/carrier-track`, { method: 'POST', body: { carrier, trackingNumber } }),
  },
  getPhotoUrl: (storagePath: string) => `${UPLOAD_BASE}/${storagePath}`,
};
