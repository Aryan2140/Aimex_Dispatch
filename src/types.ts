export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  role: 'admin' | 'user';
};

export type DispatchProvider = {
  id: string;
  name: string;
  key: string;
  carrier_code: string | null;
  is_active: boolean;
  sort_order: number;
};

export type Product = {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  barcode: string | null;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  name: string;
  sku: string | null;
  quantity: number;
};

export type Order = {
  id: string;
  created_by: string;
  customer_name: string;
  customer_address: string;
  customer_phone: string | null;
  customer_email: string | null;
  dispatch_provider_id: string | null;
  tracking_number: string | null;
  tracking_status: Record<string, unknown> | null;
  carrier_status_text: string | null;
  label_photo_path: string | null;
  notes: string | null;
  status: 'captured' | 'packed' | 'dispatched' | 'cancelled';
  created_at: string;
  updated_at: string;
  order_items?: OrderItem[];
  dispatch_providers?: DispatchProvider | null;
};

export type PackagingPhoto = {
  id: string;
  order_id: string;
  storage_path: string;
  taken_at: string;
};
