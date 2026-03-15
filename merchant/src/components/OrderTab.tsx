import { useState, useEffect } from 'react';
import { MenuData, MenuItem, QRCodeItem, PendingOrder } from '../types';
import { api } from '../utils/api';
import { QRViewer } from './QRViewer';

interface Props {
  sessionToken: string;
  staffName: string;
  staffLineId: string | null;
  onOrderCommitted: () => void;
}

export function OrderTab({ sessionToken, staffName, staffLineId, onOrderCommitted }: Props) {
  const [menuData, setMenuData] = useState<MenuData | null>(null);
  const [menuError, setMenuError] = useState(false);
  const [orderItems, setOrderItems] = useState<Record<string, number>>({});
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerQRs, setViewerQRs] = useState<QRCodeItem[]>([]);
  const [drinkList, setDrinkList] = useState<string[]>([]);
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch('/menu.json')
      .then(r => r.json())
      .then(setMenuData)
      .catch(() => setMenuError(true));
  }, []);

  function changeQty(itemId: string, delta: number) {
    setOrderItems(prev => {
      const cur = prev[itemId] || 0;
      const next = Math.max(0, cur + delta);
      const updated = { ...prev };
      if (next === 0) delete updated[itemId];
      else updated[itemId] = next;
      return updated;
    });
  }

  // Totals
  let totalCups = 0, totalAmount = 0;
  const allItems: MenuItem[] = menuData?.categories.flatMap(c => c.items) || [];
  for (const item of allItems) {
    const qty = orderItems[item.id] || 0;
    totalCups += qty;
    totalAmount += qty * item.price;
  }

  async function openQRViewer() {
    if (totalCups === 0) return;
    setGenerating(true);

    const orderLines = allItems
      .filter(item => (orderItems[item.id] || 0) > 0)
      .map(item => ({ ...item, qty: orderItems[item.id] }));

    const data = await api<{ success: boolean; qrCodes: QRCodeItem[] }>(
      '/api/admin/qrcode/generate',
      sessionToken,
      { method: 'POST', body: JSON.stringify({ quantity: totalCups, expiresInDays: 30 }) }
    );
    setGenerating(false);

    if (!data?.success) return;

    const drinks: string[] = [];
    for (const line of orderLines) {
      for (let i = 0; i < line.qty; i++) drinks.push(line.name);
    }

    setDrinkList(drinks);
    setViewerQRs(data.qrCodes);
    setPendingOrder({
      staffLineId,
      staffName,
      items: orderLines.map(l => ({ name: l.name, qty: l.qty, price: l.price })),
      totalAmount,
      qrCodes: data.qrCodes.map(q => q.code),
    });
    setViewerOpen(true);
  }

  async function commitAndClose() {
    if (pendingOrder) {
      await api('/api/admin/order', sessionToken, {
        method: 'POST',
        body: JSON.stringify(pendingOrder),
      });
      onOrderCommitted();
    }
    closeViewer();
  }

  function cancelViewer() {
    setPendingOrder(null);
    closeViewer();
  }

  function closeViewer() {
    setViewerOpen(false);
    setViewerQRs([]);
    setOrderItems({});
  }

  if (menuError) {
    return <p style={{ color: 'var(--danger)', textAlign: 'center', padding: '40px 0' }}>菜單載入失敗</p>;
  }
  if (!menuData) {
    return <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '40px 0' }}>菜單載入中…</p>;
  }

  return (
    <>
      {/* Menu */}
      {menuData.categories.map(cat => (
        <div key={cat.id}>
          <div className="cat-title">{cat.name}</div>
          {cat.items.filter(i => i.available).map(item => (
            <div key={item.id} className="menu-item">
              <div className="item-info">
                <div className="item-name">{item.name}</div>
                <div className="item-price">${item.price}</div>
              </div>
              <div className="qty-ctrl">
                <button className="qty-btn" onClick={() => changeQty(item.id, -1)}>－</button>
                <span className={`qty-num${(orderItems[item.id] || 0) > 0 ? ' positive' : ''}`}>
                  {orderItems[item.id] || 0}
                </span>
                <button className="qty-btn" onClick={() => changeQty(item.id, 1)}>＋</button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Order Bar */}
      <div className="order-bar">
        <div className="order-bar-info">
          {totalCups === 0 ? (
            <div>尚未選取品項</div>
          ) : (
            <>
              <div>共 {totalCups} 杯</div>
              <div className="total-amount">合計 ${totalAmount}</div>
            </>
          )}
        </div>
        <button className="btn" onClick={openQRViewer} disabled={totalCups === 0 || generating}>
          {generating ? '生成中…' : '生成 QR'}
        </button>
      </div>

      {/* QR Viewer Overlay */}
      {viewerOpen && (
        <QRViewer
          qrCodes={viewerQRs}
          drinkList={drinkList}
          pendingOrder={pendingOrder}
          onCommit={commitAndClose}
          onCancel={cancelViewer}
        />
      )}
    </>
  );
}
