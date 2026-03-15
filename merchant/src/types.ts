export interface StaffInfo {
  lineId: string;
  name: string;
  picture?: string;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  available: boolean;
}

export interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}

export interface MenuData {
  categories: MenuCategory[];
}

export interface QRCodeItem {
  code: string;
  url: string;
  used?: boolean;
  usedAt?: string;
  createdAt?: string;
  used_at?: string;
  created_at?: string;
}

export interface OrderItem {
  name: string;
  qty: number;
  price: number;
}

export interface Order {
  staffName?: string;
  staff_name?: string;
  items?: OrderItem[];
  totalAmount?: number;
  total_amount?: number;
  qrCodes?: string[];
  qr_codes?: string[];
  createdAt?: string;
  created_at?: string;
}

export interface PendingOrder {
  staffLineId: string | null;
  staffName: string;
  items: OrderItem[];
  totalAmount: number;
  qrCodes: string[];
}

export interface Stats {
  totalUsers: number;
  totalGachas: number;
  totalQRCodes: number;
  usedQRCodes: number;
  totalOrders?: number;
}
