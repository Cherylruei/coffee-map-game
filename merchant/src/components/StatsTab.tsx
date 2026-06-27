import { useState, useEffect, useCallback } from 'react';
import { Stats, QRCodeItem, Order } from '../types';
import { api } from '../utils/api';
import { fmtDate } from '../utils/format';
import { OrderEditModal } from './OrderEditModal';
import { useDialog } from '../context/DialogContext';

interface Props {
  sessionToken: string;
  refreshSignal: number;
}

type Period = 'today' | 'month' | 'year' | 'all';

const QR_LIMIT = 5;

interface TopupRecord {
  amount: number;
  payment_method: string | null;
  used_at: string;
}

interface WalletTransaction {
  id: string;
  amount: number;
  type: 'topup' | 'spend';
  note?: string | null;
  order_ref?: string | null;
  created_at: string;
  users?: { display_name: string | null; line_user_id: string | null } | null;
}

function filterByPeriod(orders: Order[], period: Period): Order[] {
  const now = new Date();
  return orders.filter((o) => {
    const dateStr = (o.created_at ?? o.createdAt) as string;
    let d: Date;

    // 解析日期：支持 ISO 字符串和其他格式
    if (typeof dateStr === 'string') {
      d = new Date(dateStr);
    } else {
      d = new Date(dateStr);
    }

    if (isNaN(d.getTime())) return period === 'all';

    // 使用 UTC 比较以避免时区问题
    const dUTC = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const nowUTC = new Date(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );

    if (period === 'today') return dUTC.getTime() === nowUTC.getTime();
    if (period === 'month')
      return (
        d.getUTCFullYear() === now.getUTCFullYear() &&
        d.getUTCMonth() === now.getUTCMonth()
      );
    if (period === 'year') return d.getUTCFullYear() === now.getUTCFullYear();
    return true;
  });
}

function computeSummary(orders: Order[]) {
  let totalRevenue = 0,
    cashAmount = 0,
    linePayAmount = 0,
    walletOrderAmount = 0,
    unsetAmount = 0,
    cashCount = 0,
    linePayCount = 0,
    walletOrderCount = 0,
    unsetCount = 0,
    totalCups = 0,
    rewardRedeemedCups = 0,
    rewardDiscountTotal = 0;
  const itemMap: Record<string, number> = {};
  for (const o of orders) {
    const amount = (o.total_amount ?? o.totalAmount ?? 0) as number;
    totalRevenue += amount;
    const pm = o.payment_method ?? o.paymentMethod;
    if (pm === 'line_pay') {
      linePayCount++;
      linePayAmount += amount;
    } else if (pm === 'wallet') {
      walletOrderCount++;
      walletOrderAmount += amount;
    } else if (pm === 'cash') {
      cashCount++;
      cashAmount += amount;
    } else {
      unsetCount++;
      unsetAmount += amount;
    }
    for (const item of o.items ?? []) {
      totalCups += item.qty;
      itemMap[item.name] = (itemMap[item.name] || 0) + item.qty;
    }

    const rewardCode = o.reward_code ?? o.rewardCode;
    if (rewardCode) {
      rewardRedeemedCups += 1;
      rewardDiscountTotal += (o.reward_discount ?? o.rewardDiscount ?? 0) as number;
    }
  }
  const topItems = Object.entries(itemMap)
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => ({ name, count }));
  return {
    totalOrders: orders.length,
    totalRevenue,
    cashAmount,
    linePayAmount,
    walletOrderAmount,
    unsetAmount,
    cashCount,
    linePayCount,
    walletOrderCount,
    unsetCount,
    totalCups,
    rewardRedeemedCups,
    rewardDiscountTotal,
    topItems,
  };
}

function filterTopupByPeriod(topups: TopupRecord[], period: Period): TopupRecord[] {
  const now = new Date();
  return topups.filter((t) => {
    const d = new Date(t.used_at);
    if (isNaN(d.getTime())) return period === 'all';
    const dUTC = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const nowUTC = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (period === 'today') return dUTC.getTime() === nowUTC.getTime();
    if (period === 'month')
      return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
    if (period === 'year') return d.getUTCFullYear() === now.getUTCFullYear();
    return true;
  });
}

function computeTopupSummary(topups: TopupRecord[]) {
  let total = 0, cashAmount = 0, lineAmount = 0;
  for (const t of topups) {
    total += t.amount;
    if (t.payment_method === 'line') lineAmount += t.amount;
    else cashAmount += t.amount;
  }
  return { total, cashAmount, lineAmount, count: topups.length };
}

function periodToDateRange(period: Period): { start?: string; end?: string } {
  const now = new Date();
  if (period === 'today') {
    const d = now.toISOString().slice(0, 10);
    return { start: `${d}T00:00:00.000Z`, end: `${d}T23:59:59.999Z` };
  }
  if (period === 'month') {
    const y = now.getUTCFullYear(), m = now.getUTCMonth();
    return {
      start: new Date(Date.UTC(y, m, 1)).toISOString(),
      end: new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999)).toISOString(),
    };
  }
  if (period === 'year') {
    const y = now.getUTCFullYear();
    return {
      start: new Date(Date.UTC(y, 0, 1)).toISOString(),
      end: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999)).toISOString(),
    };
  }
  return {};
}

function paymentLabel(method: string | null | undefined): string {
  if (method === 'line_pay') return 'LINE Pay';
  if (method === 'wallet') return '儲值金';
  if (method === 'cash') return '現金';
  return '未選擇';
}

function fmtDateOnly(val: string | null | undefined): string {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('zh-TW');
}

function fmtTimeOnly(val: string | null | undefined): string {
  if (!val) return '';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('zh-TW', { hour12: false });
}

// 讓 Excel 把員編 / LINE ID 當成文字，避免開頭的 0 被吃掉（005808 → 5808）
function asTextCell(val: string): string {
  return val ? `="${val}"` : '';
}

function exportCSV(
  orders: Order[],
  walletTxs: WalletTransaction[],
  periodLabel: string,
) {
  const rows: string[][] = [];

  rows.push(['【訂單明細】']);
  rows.push([
    '訂單編號', '日期', '時間', '員工', '顧客（LINE 名稱）', 'LINE ID / 員編',
    '品項', '數量', '單價', '小計', '折扣', '訂單合計', '付款方式', '備註',
  ]);

  orders.forEach((order, i) => {
    // 同一張單的每一列共用同一個編號，方便對單時把多品項圈在一起
    const orderNo = `#${String(i + 1).padStart(3, '0')}`;
    const dateStr = fmtDateOnly(order.createdAt ?? order.created_at);
    const timeStr = fmtTimeOnly(order.createdAt ?? order.created_at);
    const staff = order.staffName ?? order.staff_name ?? '未知';
    const payment = paymentLabel(order.paymentMethod ?? order.payment_method);
    const total = String(order.totalAmount ?? order.total_amount ?? 0);
    const custName = order.customerName ?? order.customer_name ?? '';
    const custId = order.customerLineId ?? order.customer_line_id
      ?? order.employeeId ?? order.employee_id ?? '';
    const idText = asTextCell(custId);
    const discount = (order.discount ?? 0) as number;
    const discountStr = discount > 0 ? String(discount) : '';
    const rewardCode = order.rewardCode ?? order.reward_code ?? '';
    const rewardItemName = order.rewardItemName ?? order.reward_item_name ?? '';
    const note = rewardCode ? `兌換券 ${rewardItemName || '免費飲品'} ${rewardCode}` : '';

    const items = order.items && order.items.length > 0
      ? order.items
      : [{ name: '(無品項)', qty: 0, price: 0 }];

    items.forEach((item, idx) => {
      const first = idx === 0;
      // 訂單層級欄位（日期、員工、付款…）每一列都填滿；金額/折扣/合計只放第一列避免重複加總
      rows.push([
        orderNo,
        dateStr,
        timeStr,
        staff,
        custName,
        idText,
        item.name,
        String(item.qty),
        String(item.price),
        String(item.qty * item.price),
        first ? discountStr : '',
        first ? total : '',
        payment,
        first ? note : '',
      ]);
    });
  });
  if (orders.length === 0) rows.push(['(本期間無訂單)']);

  rows.push([]);
  rows.push(['【儲值金明細】']);
  rows.push(['日期', 'LINE 名稱', 'LINE ID', '類型', '金額', '備註']);
  for (const tx of walletTxs) {
    rows.push([
      fmtDate(tx.created_at),
      tx.users?.display_name ?? '—',
      tx.users?.line_user_id ?? '—',
      tx.type === 'topup' ? '儲值' : '消費',
      String(Math.abs(tx.amount)),
      tx.note ?? '',
    ]);
  }
  if (walletTxs.length === 0) rows.push(['(本期間無儲值金交易)']);

  const csv = rows
    .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `銷售報表_${periodLabel}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function StatsTab({ sessionToken, refreshSignal }: Props) {
  const showDialog = useDialog();
  const [stats, setStats] = useState<Stats | null>(null);
  const [qrAll, setQrAll] = useState<QRCodeItem[]>([]);
  const [qrExpanded, setQrExpanded] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('today');
  const [topups, setTopups] = useState<TopupRecord[]>([]);
  const [walletTxs, setWalletTxs] = useState<WalletTransaction[]>([]);

  const loadStats = useCallback(async () => {
    const data = await api<{ success: boolean; stats: Stats }>(
      '/api/admin/stats',
      sessionToken,
    );
    if (data?.success) setStats(data.stats);
  }, [sessionToken]);

  const loadQRList = useCallback(async () => {
    const data = await api<{ success: boolean; qrCodes: QRCodeItem[] }>(
      '/api/admin/qrcode/list',
      sessionToken,
    );
    if (!data?.success) return;
    const sorted = [...data.qrCodes].sort((a, b) => {
      const au = a.used ?? false,
        bu = b.used ?? false;
      if (au !== bu) return au ? -1 : 1;
      return (
        new Date(b.createdAt ?? b.created_at ?? '').getTime() -
        new Date(a.createdAt ?? a.created_at ?? '').getTime()
      );
    });
    setQrAll(sorted);
    setQrExpanded(false);
  }, [sessionToken]);

  const loadOrders = useCallback(async () => {
    const data = await api<{ success: boolean; orders: Order[] }>(
      '/api/admin/orders',
      sessionToken,
    );
    if (data?.success) setOrders(data.orders || []);
  }, [sessionToken]);

  const loadTopups = useCallback(async () => {
    const data = await api<{ success: boolean; topups: TopupRecord[] }>(
      '/api/admin/topup-summary',
      sessionToken,
    );
    if (data?.success) setTopups(data.topups || []);
  }, [sessionToken]);

  const loadWalletTxs = useCallback(async (p: Period) => {
    const { start, end } = periodToDateRange(p);
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const data = await api<{ success: boolean; transactions: WalletTransaction[] }>(
      `/api/admin/wallet-transactions${qs}`,
      sessionToken,
    );
    if (data?.success) setWalletTxs(data.transactions || []);
  }, [sessionToken]);

  useEffect(() => {
    loadStats();
    loadQRList();
    loadOrders();
    loadTopups();
    loadWalletTxs(period);
  }, [refreshSignal, loadStats, loadQRList, loadOrders, loadTopups, loadWalletTxs, period]);

  function refresh() {
    loadStats();
    loadQRList();
    loadOrders();
    loadTopups();
    loadWalletTxs(period);
  }

  function handleSaved() {
    setEditingOrder(null);
    loadOrders();
    loadStats();
  }
  function handleDeleted() {
    setEditingOrder(null);
    loadOrders();
    loadStats();
  }

  function handleDirectDelete(orderId: string) {
    showDialog({
      type: 'confirm',
      title: '確定刪除此訂單？',
      message: '此動作無法復原，相關統計數據也會一併更新。',
      buttons: [
        { label: '取消', variant: 'secondary' },
        {
          label: '確認刪除',
          variant: 'danger',
          onClick: () => {
            setDeletingOrderId(orderId);
            api<{ success: boolean }>(
              `/api/admin/order/${orderId}`,
              sessionToken,
              { method: 'DELETE' },
            ).then((data) => {
              setDeletingOrderId(null);
              if (data && (data as { success: boolean }).success) {
                loadOrders();
                loadStats();
              } else {
                showDialog({ type: 'error', title: '刪除失敗，請稍後再試' });
              }
            });
          },
        },
      ],
    });
  }

  const qrDisplayed = qrExpanded ? qrAll : qrAll.slice(0, QR_LIMIT);
  const qrTotal = qrAll.length;
  const qrUsed = qrAll.filter((q) => q.used ?? false).length;

  const periodOrders = filterByPeriod(orders, period);
  const summary = computeSummary(periodOrders);
  const periodTopups = filterTopupByPeriod(topups, period);
  const topupSummary = computeTopupSummary(periodTopups);

  const PERIOD_LABELS: Record<Period, string> = {
    today: '今日',
    month: '本月',
    year: '今年',
    all: '全部',
  };

  return (
    <>
      {/* 銷售匯總 */}
      <div className='card'>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <h2 style={{ margin: 0 }}>📊 銷售匯總</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className='btn outline'
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
              onClick={() => exportCSV(periodOrders, walletTxs, PERIOD_LABELS[period])}
              disabled={periodOrders.length === 0 && walletTxs.length === 0}
            >
              匯出 CSV
            </button>
            <button
              className='btn outline'
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
              onClick={refresh}
            >
              重整
            </button>
          </div>
        </div>

        {/* 期間選擇 */}
        <div className='period-tabs'>
          {(['today', 'month', 'year', 'all'] as Period[]).map((p) => (
            <button
              key={p}
              className={`period-tab${period === p ? ' active' : ''}`}
              onClick={() => { setPeriod(p); loadWalletTxs(p); }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* 匯總數字 */}
        <div className='stats-grid' style={{ marginTop: 12 }}>
          <div className='stat'>
            <div className='num'>{summary.totalOrders}</div>
            <div className='lbl'>訂單數</div>
          </div>
          <div className='stat'>
            <div className='num'>{summary.totalCups}</div>
            <div className='lbl'>總杯數</div>
          </div>
          <div className='stat'>
            <div className='num'>{summary.rewardRedeemedCups}</div>
            <div className='lbl'>地圖兌換杯數</div>
          </div>
          <div className='stat' style={{ gridColumn: 'span 2' }}>
            <div className='num' style={{ color: '#2e7d32' }}>
              ${topupSummary.total.toLocaleString()}
            </div>
            <div className='lbl'>總儲值金額</div>
          </div>
          <div className='stat' style={{ gridColumn: 'span 2' }}>
            <div className='num' style={{ color: 'var(--accent)' }}>
              ${summary.totalRevenue.toLocaleString()}
            </div>
            <div className='lbl'>總營收</div>
          </div>
        </div>

        {/* 付款分類 */}
        {(summary.totalOrders > 0 || topupSummary.count > 0) && (
          <div className='inv-breakdown' style={{ marginTop: 12 }}>
            <div className='inv-breakdown-row'>
              <span>💵 現金</span>
              <span>
                {summary.cashCount} 筆・${summary.cashAmount.toLocaleString()}
              </span>
            </div>
            <div className='inv-breakdown-row'>
              <span>💚 LINE Pay</span>
              <span>
                {summary.linePayCount} 筆・$
                {summary.linePayAmount.toLocaleString()}
              </span>
            </div>
            <div className='inv-breakdown-row'>
              <span>💰 儲值金付款</span>
              <span>
                {summary.walletOrderCount} 筆・${summary.walletOrderAmount.toLocaleString()}
              </span>
            </div>
            <div className='inv-breakdown-row'>
              <span>⏺ 未選擇付款</span>
              <span>
                {summary.unsetCount} 筆・${summary.unsetAmount.toLocaleString()}
              </span>
            </div>
            <div className='inv-breakdown-row'>
              <span>🏦 儲值入帳</span>
              <span>
                {topupSummary.count} 筆・${topupSummary.total.toLocaleString()}
              </span>
            </div>
            <div className='inv-breakdown-row'>
              <span>🎁 集滿兌換</span>
              <span>
                {summary.rewardRedeemedCups} 杯・折抵 ${summary.rewardDiscountTotal.toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* 品項銷售排行 */}
        {summary.topItems.length > 0 && (
          <>
            <div className='inv-section-title' style={{ marginTop: 14 }}>
              ☕ 品項銷售
            </div>
            <div className='inv-breakdown'>
              {summary.topItems.map((item, i) => (
                <div key={item.name} className='inv-breakdown-row'>
                  <span>
                    {i + 1}. {item.name}
                  </span>
                  <span>{item.count} 杯</span>
                </div>
              ))}
            </div>
          </>
        )}

        {summary.totalOrders === 0 && (
          <p
            style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 8 }}
          >
            {PERIOD_LABELS[period]}尚無點單紀錄
          </p>
        )}
      </div>

      {/* 整體概覽 */}
      <div className='card'>
        <h2>🔢 系統概覽</h2>
        <div className='stats-grid'>
          <div className='stat'>
            <div className='num'>{stats?.totalUsers ?? '—'}</div>
            <div className='lbl'>用戶數</div>
          </div>
          <div className='stat'>
            <div className='num'>{stats?.totalGachas ?? '—'}</div>
            <div className='lbl'>抽卡次數</div>
          </div>
          <div className='stat'>
            <div className='num'>{stats?.totalQRCodes ?? '—'}</div>
            <div className='lbl'>QR 總數</div>
          </div>
          <div className='stat'>
            <div className='num'>{stats?.usedQRCodes ?? '—'}</div>
            <div className='lbl'>已使用</div>
          </div>
          <div className='stat' style={{ gridColumn: 'span 2' }}>
            <div className='num'>{stats?.totalOrders ?? '—'}</div>
            <div className='lbl'>累積點單筆數</div>
          </div>
        </div>
      </div>

      {/* 點單紀錄 */}
      <div className='card'>
        <h2>🧾 點單紀錄</h2>
        {orders.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            尚無點單紀錄
          </p>
        ) : (
          orders.slice(0, 20).map((order, i) => {
            const items = order.items || [];
            const itemsStr = items
              .map((it) => `${it.name} ×${it.qty}`)
              .join('・');
            const total = order.totalAmount ?? order.total_amount ?? '—';
            const discount = order.discount ?? 0;
            const rewardDisc = order.rewardDiscount ?? order.reward_discount ?? 0;
            const manualDiscount = Math.max(0, (discount as number) - (rewardDisc as number));
            const payment = paymentLabel(order.paymentMethod ?? order.payment_method);
            const staff = order.staffName ?? order.staff_name ?? '未知員工';
            const at = fmtDate(order.createdAt ?? order.created_at);
            const qrCount = (order.qrCodes ?? order.qr_codes ?? []).length;
            const custName = order.customerName ?? order.customer_name;
            const empId = order.employeeId ?? order.employee_id;
            const rewardCode = order.rewardCode ?? order.reward_code;
            const rewardItemName = order.rewardItemName ?? order.reward_item_name;
            return (
              <div key={i} className='order-record'>
                <div className='or-header'>
                  <span className='or-staff'>{staff}</span>
                  <span className='or-time'>{at}</span>
                  {order.id && (
                    <>
                      <button
                        className='or-edit-btn'
                        onClick={() => setEditingOrder(order)}
                      >
                        修改
                      </button>
                      <button
                        className='or-delete-btn'
                        onClick={() => handleDirectDelete(order.id!)}
                        disabled={deletingOrderId === order.id}
                      >
                        {deletingOrderId === order.id ? '刪除中…' : '刪除'}
                      </button>
                    </>
                  )}
                </div>
                <div className='or-items'>{itemsStr || '無品項資料'}</div>
                <div className='or-total'>
                  合計 ${total}
                  {manualDiscount > 0 && (
                    <span style={{ color: 'var(--danger)', marginLeft: 6 }}>
                      －${manualDiscount}
                    </span>
                  )}
                  ・{payment}・{qrCount} 張 QR
                  {rewardCode ? (
                    <span style={{ marginLeft: 6, color: '#2e7d32' }}>
                      來源：兌換券・{rewardItemName || '免費飲品'}・{rewardCode}
                    </span>
                  ) : null}
                  {custName ? (
                    <span style={{ marginLeft: 6, color: 'var(--accent)' }}>
                      👤 {custName}
                    </span>
                  ) : empId ? (
                    <span style={{ marginLeft: 6, color: 'var(--muted)' }}>
                      員編：{empId}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 已核銷兌換碼列表 */}
      <div className='card'>
        <h2>🎟 已核銷兌換碼</h2>
        {orders.filter((order) => (order.rewardCode ?? order.reward_code)).length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            尚無集滿兌換核銷紀錄
          </p>
        ) : (
          orders
            .filter((order) => (order.rewardCode ?? order.reward_code))
            .slice(0, 20)
            .map((order, index) => {
              const rewardCode = order.rewardCode ?? order.reward_code ?? '—';
              const rewardItemName = order.rewardItemName ?? order.reward_item_name ?? '免費飲品';
              const staff = order.staffName ?? order.staff_name ?? '未知員工';
              const customer = order.customerName ?? order.customer_name ?? '未知顧客';
              const payment = paymentLabel(order.paymentMethod ?? order.payment_method);
              return (
                <div key={`${rewardCode}-${index}`} className='order-record'>
                  <div className='or-header'>
                    <span className='or-staff'>{rewardCode}</span>
                    <span className='or-time'>{fmtDate(order.createdAt ?? order.created_at)}</span>
                  </div>
                  <div className='or-items'>
                    {rewardItemName}・核銷人 {customer}
                  </div>
                  <div className='or-total'>
                    來源：兌換券・店員 {staff}・付款 {payment}
                  </div>
                </div>
              );
            })
        )}
      </div>

      {/* QR Code 紀錄 */}
      <div className='card'>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <h2 style={{ margin: 0 }}>📋 QR Code 紀錄</h2>
          <span className='section-label' style={{ margin: 0 }}>
            共 {qrTotal} 筆・已用 {qrUsed}・未用 {qrTotal - qrUsed}
          </span>
        </div>
        {qrDisplayed.map((q) => {
          const isUsed = q.used ?? false;
          return (
            <div
              key={q.code}
              className={`qr-list-item${isUsed ? ' used' : ''}`}
            >
              <div className='info'>
                <div className='code'>{q.code}</div>
                <div className='meta'>
                  {isUsed
                    ? `使用：${fmtDate(q.usedAt ?? q.used_at)}`
                    : `建立：${fmtDate(q.createdAt ?? q.created_at)}`}
                </div>
              </div>
              <span
                className={`badge ${isUsed ? 'badge-used' : 'badge-unused'}`}
              >
                {isUsed ? '已使用' : '未使用'}
              </span>
            </div>
          );
        })}
        {qrAll.length > QR_LIMIT && (
          <button
            className='expand-btn'
            onClick={() => setQrExpanded((e) => !e)}
          >
            {qrExpanded ? '▲ 收起' : `▼ 查看更多（共 ${qrAll.length} 筆）`}
          </button>
        )}
      </div>

      {editingOrder && (
        <OrderEditModal
          order={editingOrder}
          sessionToken={sessionToken}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onClose={() => setEditingOrder(null)}
        />
      )}
    </>
  );
}
