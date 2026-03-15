import { useState, useEffect, useCallback } from 'react';
import { Stats, QRCodeItem, Order } from '../types';
import { api } from '../utils/api';
import { fmtDate } from '../utils/format';

interface Props {
  sessionToken: string;
  refreshSignal: number;
}

const QR_LIMIT = 5;

export function StatsTab({ sessionToken, refreshSignal }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [qrAll, setQrAll] = useState<QRCodeItem[]>([]);
  const [qrExpanded, setQrExpanded] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);

  const loadStats = useCallback(async () => {
    const data = await api<{ success: boolean; stats: Stats }>('/api/admin/stats', sessionToken);
    if (data?.success) setStats(data.stats);
  }, [sessionToken]);

  const loadQRList = useCallback(async () => {
    const data = await api<{ success: boolean; qrCodes: QRCodeItem[]; total: number; used: number; unused: number }>(
      '/api/admin/qrcode/list', sessionToken
    );
    if (!data?.success) return;
    const sorted = [...data.qrCodes].sort((a, b) => {
      const au = a.used ?? false;
      const bu = b.used ?? false;
      if (au !== bu) return au ? -1 : 1;
      const ac = a.createdAt ?? a.created_at ?? '';
      const bc = b.createdAt ?? b.created_at ?? '';
      return new Date(bc).getTime() - new Date(ac).getTime();
    });
    setQrAll(sorted);
    setQrExpanded(false);
  }, [sessionToken]);

  const loadOrders = useCallback(async () => {
    const data = await api<{ success: boolean; orders: Order[] }>('/api/admin/orders', sessionToken);
    if (data?.success) setOrders(data.orders || []);
  }, [sessionToken]);

  useEffect(() => {
    loadStats();
    loadQRList();
    loadOrders();
  }, [refreshSignal, loadStats, loadQRList, loadOrders]);

  function refresh() {
    loadStats();
    loadQRList();
    loadOrders();
  }

  const qrDisplayed = qrExpanded ? qrAll : qrAll.slice(0, QR_LIMIT);
  const qrTotal = qrAll.length;
  const qrUsed = qrAll.filter(q => q.used ?? false).length;
  const qrUnused = qrTotal - qrUsed;

  return (
    <>
      {/* Stats Grid */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>📊 統計數據</h2>
          <button className="btn outline" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={refresh}>重整</button>
        </div>
        <div className="stats-grid">
          <div className="stat"><div className="num">{stats?.totalUsers ?? '—'}</div><div className="lbl">用戶數</div></div>
          <div className="stat"><div className="num">{stats?.totalGachas ?? '—'}</div><div className="lbl">抽卡次數</div></div>
          <div className="stat"><div className="num">{stats?.totalQRCodes ?? '—'}</div><div className="lbl">QR 總數</div></div>
          <div className="stat"><div className="num">{stats?.usedQRCodes ?? '—'}</div><div className="lbl">已使用</div></div>
          <div className="stat" style={{ gridColumn: 'span 2' }}>
            <div className="num">{stats?.totalOrders ?? '—'}</div>
            <div className="lbl">點單筆數</div>
          </div>
        </div>
      </div>

      {/* Order Records */}
      <div className="card">
        <h2>🧾 點單紀錄</h2>
        {orders.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>尚無點單紀錄</p>
        ) : (
          orders.slice(0, 20).map((order, i) => {
            const items = order.items || [];
            const itemsStr = items.map(it => `${it.name} ×${it.qty}`).join('・');
            const total = order.totalAmount ?? order.total_amount ?? '—';
            const staff = order.staffName ?? order.staff_name ?? '未知員工';
            const at = fmtDate(order.createdAt ?? order.created_at);
            const qrCount = (order.qrCodes ?? order.qr_codes ?? []).length;
            return (
              <div key={i} className="order-record">
                <div className="or-header">
                  <span className="or-staff">{staff}</span>
                  <span className="or-time">{at}</span>
                </div>
                <div className="or-items">{itemsStr || '無品項資料'}</div>
                <div className="or-total">合計 ${total}・共 {qrCount} 張 QR</div>
              </div>
            );
          })
        )}
      </div>

      {/* QR Code List */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>📋 QR Code 紀錄</h2>
          <span className="section-label" style={{ margin: 0 }}>
            共 {qrTotal} 筆・已用 {qrUsed}・未用 {qrUnused}
          </span>
        </div>

        {qrDisplayed.map(q => {
          const isUsed = q.used ?? false;
          const usedAt = fmtDate(q.usedAt ?? q.used_at);
          const createdAt = fmtDate(q.createdAt ?? q.created_at);
          return (
            <div key={q.code} className={`qr-list-item${isUsed ? ' used' : ''}`}>
              <div className="info">
                <div className="code">{q.code}</div>
                <div className="meta">{isUsed ? `使用：${usedAt}` : `建立：${createdAt}`}</div>
              </div>
              <span className={`badge ${isUsed ? 'badge-used' : 'badge-unused'}`}>
                {isUsed ? '已使用' : '未使用'}
              </span>
            </div>
          );
        })}

        {qrAll.length > QR_LIMIT && (
          <button className="expand-btn" onClick={() => setQrExpanded(e => !e)}>
            {qrExpanded ? '▲ 收起' : `▼ 查看更多（共 ${qrAll.length} 筆）`}
          </button>
        )}
      </div>
    </>
  );
}
