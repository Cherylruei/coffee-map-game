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
  cupCount?: number;
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
  doubleShot?: boolean;
}

export type PaymentMethod = 'cash' | 'line_pay';

export interface Order {
  id?: string;
  staffName?: string;
  staff_name?: string;
  items?: OrderItem[];
  totalAmount?: number;
  total_amount?: number;
  discount?: number;
  paymentMethod?: PaymentMethod;
  payment_method?: PaymentMethod;
  employeeId?: string;
  employee_id?: string;
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
  discount: number;
  paymentMethod: PaymentMethod;
  employeeId: string;
  qrCode: string;
  cupCount: number;
}

export interface Stats {
  totalUsers: number;
  totalGachas: number;
  totalQRCodes: number;
  usedQRCodes: number;
  totalOrders?: number;
}

export interface TodayStats {
  date: string;
  totalOrders: number;
  totalCups: number;
  totalRevenue: number;
  cash: { count: number; amount: number };
  linePay: { count: number; amount: number };
  staffBreakdown: { name: string; count: number; amount: number }[];
  topItems: { name: string; count: number }[];
}

export interface InventoryRecord {
  date: string;
  coffee_beans_bags: number;
  coffee_beans_grams: number;
  milk_bottles: number;
  milk_ml: number;
  completed_by?: string | null;
}
