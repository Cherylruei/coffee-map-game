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

export type PaymentMethod = 'cash' | 'line_pay' | 'wallet';
export type OptionalPaymentMethod = PaymentMethod | '' | null;

export interface Order {
  id?: string;
  staffName?: string;
  staff_name?: string;
  items?: OrderItem[];
  totalAmount?: number;
  total_amount?: number;
  discount?: number;
  paymentMethod?: OptionalPaymentMethod;
  payment_method?: OptionalPaymentMethod;
  employeeId?: string;
  employee_id?: string;
  qrCodes?: string[];
  qr_codes?: string[];
  createdAt?: string;
  created_at?: string;
  customerName?: string | null;
  customer_name?: string | null;
  customerLineId?: string | null;
  customer_line_id?: string | null;
  // 會員自行登記的員編快照（與 employee_id 店員代填區隔）
  customerEmployeeId?: string | null;
  customer_employee_id?: string | null;
  rewardCode?: string | null;
  reward_code?: string | null;
  rewardType?: string | null;
  reward_type?: string | null;
  rewardDiscount?: number;
  reward_discount?: number;
  rewardItemName?: string | null;
  reward_item_name?: string | null;
  // 訂單狀態：'active'（預設）/ 'voided'（退款作廢，軟刪除）
  status?: string;
  voidedAt?: string | null;
  voided_at?: string | null;
  voidedReason?: string | null;
  voided_reason?: string | null;
}

export interface PendingOrder {
  staffLineId: string | null;
  staffName: string;
  items: OrderItem[];
  totalAmount: number;
  discount: number;
  paymentMethod?: OptionalPaymentMethod;
  employeeId: string;
  qrCode?: string | null;
  cupCount: number;
  rewardCode?: string | null;
  rewardItemName?: string | null;
  rewardDiscount?: number;
}

export interface Stats {
  totalUsers: number;
  totalGachas: number;
  totalQRCodes: number;
  usedQRCodes: number;
  totalOrders?: number;
  totalRewardRedemptions?: number;
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
