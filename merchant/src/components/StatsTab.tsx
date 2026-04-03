import { useState, useEffect, useCallback } from 'react';
import { Stats, QRCodeItem, Order, InventoryRecord } from '../types';
import { api } from '../utils/api';
import { fmtDate } from '../utils/format';
import { OrderEditModal } from './OrderEditModal';

interface Props {
  sessionToken: string;
  refreshSignal: number;
}

type Period = 'today' | 'month' | 'year' | 'all';

const QR_LIMIT = 5;

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
    cashCount = 0,
    linePayCount = 0,
    totalCups = 0;
  const itemMap: Record<string, number> = {};
  for (const o of orders) {
    const amount = (o.total_amount ?? o.totalAmount ?? 0) as number;
    totalRevenue += amount;
    const pm = o.payment_method ?? o.paymentMethod;
    if (pm === 'line_pay') {
      linePayCount++;
      linePayAmount += amount;
    } else {
      cashCount++;
      cashAmount += amount;
    }
    for (const item of o.items ?? []) {
      totalCups += item.qty;
      itemMap[item.name] = (itemMap[item.name] || 0) + item.qty;
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
    cashCount,
    linePayCount,
    totalCups,
    topItems,
  };
}

export function StatsTab({ sessionToken, refreshSignal }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [qrAll, setQrAll] = useState<QRCodeItem[]>([]);
  const [qrExpanded, setQrExpanded] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [lastInventory, setLastInventory] = useState<InventoryRecord | null>(
    null,
  );
  const [period, setPeriod] = useState<Period>('today');

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

  const loadInventory = useCallback(async () => {
    const data = await api<{
      success: boolean;
      inventory: InventoryRecord | null;
    }>('/api/inventory/last', sessionToken);
    if (data?.success) setLastInventory(data.inventory ?? null);
  }, [sessionToken]);

  useEffect(() => {
    loadStats();
    loadQRList();
    loadOrders();
    loadInventory();
  }, [refreshSignal, loadStats, loadQRList, loadOrders, loadInventory]);

  function refresh() {
    loadStats();
    loadQRList();
    loadOrders();
    loadInventory();
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

  const qrDisplayed = qrExpanded ? qrAll : qrAll.slice(0, QR_LIMIT);
  const qrTotal = qrAll.length;
  const qrUsed = qrAll.filter((q) => q.used ?? false).length;

  const periodOrders = filterByPeriod(orders, period);
  const summary = computeSummary(periodOrders);

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
          <button
            className='btn outline'
            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            onClick={refresh}
          >
            重整
          </button>
        </div>

        {/* 期間選擇 */}
        <div className='period-tabs'>
          {(['today', 'month', 'year', 'all'] as Period[]).map((p) => (
            <button
              key={p}
              className={`period-tab${period === p ? ' active' : ''}`}
              onClick={() => setPeriod(p)}
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
          <div className='stat' style={{ gridColumn: 'span 2' }}>
            <div className='num' style={{ color: 'var(--accent)' }}>
              ${summary.totalRevenue.toLocaleString()}
            </div>
            <div className='lbl'>總營收</div>
          </div>
        </div>

        {/* 付款分類 */}
        {summary.totalOrders > 0 && (
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

      {/* 庫存現況 */}
      <div className='card'>
        <h2>📦 庫存現況</h2>
        {lastInventory ? (
          <>
            <div
              style={{
                fontSize: '0.78rem',
                color: 'var(--muted)',
                marginBottom: 10,
              }}
            >
              最後盤點：{lastInventory.date}
              {lastInventory.completed_by &&
                ` ・ ${lastInventory.completed_by}`}
            </div>
            <div className='inv-breakdown'>
              <div className='inv-breakdown-row'>
                <span>☕ 咖啡豆</span>
                <span>
                  {lastInventory.coffee_beans_bags > 0
                    ? `${lastInventory.coffee_beans_bags} 包`
                    : ''}
                  {lastInventory.coffee_beans_grams > 0
                    ? ` + ${lastInventory.coffee_beans_grams}g`
                    : ''}
                  {lastInventory.coffee_beans_bags === 0 &&
                  lastInventory.coffee_beans_grams === 0
                    ? '0g'
                    : ''}
                </span>
              </div>
              <div className='inv-breakdown-row'>
                <span>🥛 牛奶</span>
                <span>
                  {lastInventory.milk_bottles > 0
                    ? `${lastInventory.milk_bottles} 瓶`
                    : ''}
                  {lastInventory.milk_ml > 0
                    ? ` + ${lastInventory.milk_ml}ml`
                    : ''}
                  {lastInventory.milk_bottles === 0 &&
                  lastInventory.milk_ml === 0
                    ? '0ml'
                    : ''}
                </span>
              </div>
            </div>
          </>
        ) : (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            尚無盤點紀錄，請至「盤點」頁面進行記錄
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
            const payment =
              (order.paymentMethod ?? order.payment_method) === 'line_pay'
                ? 'LINE Pay'
                : '現金';
            const staff = order.staffName ?? order.staff_name ?? '未知員工';
            const at = fmtDate(order.createdAt ?? order.created_at);
            const qrCount = (order.qrCodes ?? order.qr_codes ?? []).length;
            const empId = order.employeeId ?? order.employee_id;
            return (
              <div key={i} className='order-record'>
                <div className='or-header'>
                  <span className='or-staff'>{staff}</span>
                  <span className='or-time'>{at}</span>
                  {order.id && (
                    <button
                      className='or-edit-btn'
                      onClick={() => setEditingOrder(order)}
                    >
                      修改
                    </button>
                  )}
                </div>
                <div className='or-items'>{itemsStr || '無品項資料'}</div>
                <div className='or-total'>
                  合計 ${total}
                  {(discount as number) > 0 && (
                    <span style={{ color: 'var(--danger)', marginLeft: 6 }}>
                      －${discount}
                    </span>
                  )}
                  ・{payment}・{qrCount} 張 QR
                  {empId && (
                    <span style={{ marginLeft: 6, color: 'var(--muted)' }}>
                      員編：{empId}
                    </span>
                  )}
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
