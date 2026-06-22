export type Profile = {
  id: number | string;
  email: string;
  display_name: string | null;
  role: 'admin' | 'user';
};

export type DispatchProvider = {
  id: number | string;
  name: string;
  key: string;
  carrier_code: string | null;
  is_active: boolean;
  sort_order: number;
};

export type Product = {
  id: number | string;
  sku: string | null;
  name: string;
  description: string | null;
  barcode: string | null;
};

export type OrderItem = {
  id: number | string;
  order_id: number | string;
  product_id: number | string | null;
  name: string;
  sku: string | null;
  quantity: number;
};

export type Order = {
  id: number | string;
  created_by: number | string;
  customer_name: string;
  customer_address: string;
  customer_phone: string | null;
  customer_email: string | null;
  dispatch_provider_id: number | string | null;
  tracking_number: string | null;
  tracking_status: Record<string, unknown> | null;
  carrier_status_text: string | null;
  label_photo_path: string | null;
  notes: string | null;
  status: 'captured' | 'packed' | 'dispatched' | 'cancelled';
  created_at: string;
  updated_at: string;
  order_items?: OrderItem[];
  dispatch_provider?: DispatchProvider | null;
};

export type PackagingPhoto = {
  id: number | string;
  order_id: number | string;
  storage_path: string;
  taken_at: string;
};
