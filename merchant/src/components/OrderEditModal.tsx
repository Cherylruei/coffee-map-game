import { useState, useEffect } from 'react';
import { Order, OrderItem, MenuData, MenuItem, OptionalPaymentMethod } from '../types';
import { api, API_BASE } from '../utils/api';
import { useDialog } from '../context/DialogContext';

interface Props {
  order: Order;
  sessionToken: string;
  onSaved: () => void;
  onDeleted: () => void;
  onClose: () => void;
}

interface EditLine {
  name: string;
  basePrice: number;
  qty: number;
}

function buildEditLines(items: OrderItem[]): EditLine[] {
  return items
    .filter(it => it.qty > 0)
    .map(it => ({
      name: it.name,
      basePrice: it.price,
      qty: it.qty,
    }));
}

export function OrderEditModal({ order, sessionToken, onSaved, onDeleted, onClose }: Props) {
  const [lines, setLines] = useState<EditLine[]>(buildEditLines(order.items || []));
  const [discount, setDiscount] = useState(String(order.discount ?? 0));
  const [paymentMethod, setPaymentMethod] = useState<OptionalPaymentMethod>(
    order.paymentMethod ?? order.payment_method ?? ''
  );
  const [menuData, setMenuData] = useState<MenuData | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const showDialog = useDialog();

  const orderId = order.id;

  // 儲值金為真實金流（掃碼當下扣款），非可編輯標籤
  const currentPM = order.paymentMethod ?? order.payment_method;
  const isWalletOrder = currentPM === 'wallet';
  const orderTotal = order.totalAmount ?? order.total_amount ?? 0;

  useEffect(() => {
    fetch(`${API_BASE}/api/menu`)
      .then(r => r.json())
      .then(data => { if (data.success) setMenuData({ categories: data.categories }); })
      .catch(() => {});
  }, []);

  function changeQty(name: string, delta: number) {
    setLines(prev =>
      prev
        .map(l => l.name === name ? { ...l, qty: Math.max(0, l.qty + delta) } : l)
        .filter(l => l.qty > 0)
    );
  }

  function addMenuItem(item: MenuItem) {
    setLines(prev => {
      const exists = prev.find(l => l.name === item.name);
      if (exists) {
        return prev.map(l => l.name === item.name ? { ...l, qty: l.qty + 1 } : l);
      }
      return [...prev, { name: item.name, basePrice: item.price, qty: 1 }];
    });
  }

  const discountNum = Math.max(0, parseInt(discount) || 0);
  const subtotal = lines.reduce((sum, l) => sum + l.basePrice * l.qty, 0);
  const total = Math.max(0, subtotal - discountNum);

  async function handleSave() {
    if (!orderId) return;
    if (isWalletOrder) {
      showDialog({ type: 'warning', title: '儲值金訂單已扣款，不可修改，請使用退款作廢後重新開單' });
      return;
    }
    if (lines.length === 0) {
      showDialog({ type: 'warning', title: '請至少保留一個品項，若要刪除請使用「刪除訂單」' });
      return;
    }
    setSaving(true);
    const items: OrderItem[] = lines.map(l => ({
      name: l.name,
      qty: l.qty,
      price: l.basePrice,
    }));
    const data = await api<{ success: boolean }>(
      `/api/admin/order/${orderId}`,
      sessionToken,
      {
        method: 'PUT',
        body: JSON.stringify({ items, totalAmount: total, discount: discountNum, paymentMethod }),
      }
    );
    setSaving(false);
    if (data && (data as any).success) {
      onSaved();
    } else {
      showDialog({ type: 'error', title: '修改失敗，請稍後再試' });
    }
  }

  async function handleDelete() {
    if (!orderId) return;
    const data = await api<{ success: boolean }>(
      `/api/admin/order/${orderId}`,
      sessionToken,
      { method: 'DELETE' }
    );
    if (data && (data as any).success) {
      onDeleted();
    } else {
      showDialog({ type: 'error', title: (data as any)?.message || '刪除失敗，請稍後再試' });
    }
  }

  // 儲值金訂單：退款作廢（退回餘額 + 軟刪除），取代硬刪除
  async function handleVoid() {
    if (!orderId) return;
    setVoiding(true);
    const data = await api<{ success: boolean; refundedAmount?: number; message?: string }>(
      `/api/admin/order/${orderId}/void`,
      sessionToken,
      { method: 'POST', body: JSON.stringify({ reason: '退款作廢' }) }
    );
    setVoiding(false);
    if (data && (data as any).success) {
      showDialog({ type: 'success', title: `已退款 $${(data as any).refundedAmount} 至顧客錢包` });
      onDeleted();
    } else {
      showDialog({ type: 'error', title: (data as any)?.message || '退款作廢失敗，請稍後再試' });
    }
  }

  const allMenuItems: MenuItem[] = menuData?.categories.flatMap(c => c.items.filter(i => i.available)) || [];

  return (
    <div className="edit-modal-overlay">
      <div className="edit-modal">
        <div className="edit-modal-bar">
          <button className="btn outline" style={{ padding: '7px 14px', fontSize: '0.85rem' }} onClick={onClose}>
            取消
          </button>
          <span className="edit-modal-title">修改訂單</span>
          <button className="btn" style={{ padding: '7px 14px', fontSize: '0.85rem' }} onClick={handleSave} disabled={saving || isWalletOrder}>
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>

        <div className="edit-modal-body">
          {isWalletOrder && (
            <div
              style={{
                background: 'var(--warning-bg, #fff7e6)',
                border: '1px solid var(--warning, #f0a020)',
                borderRadius: 8,
                padding: '10px 12px',
                marginBottom: 14,
                fontSize: '0.85rem',
                lineHeight: 1.5,
                color: "#000",
              }}
            >
              💰 此為<strong>儲值金訂單</strong>，已於掃碼時扣款 ${orderTotal}。
              儲值金為真實金流，無法於此編輯；如需更動請走<strong>退款作廢</strong>後重新開單。
            </div>
          )}
          <div className="edit-section-label">品項</div>
          {lines.length === 0 && (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 8 }}>無品項</p>
          )}
          {lines.map(line => (
            <div key={line.name} className="menu-item">
              <div className="item-info">
                <div className="item-name">{line.name}</div>
                <div className="item-price">${line.basePrice}</div>
              </div>
              <div className="qty-ctrl">
                <button className="qty-btn" onClick={() => changeQty(line.name, -1)} disabled={isWalletOrder}>－</button>
                <span className={`qty-num${line.qty > 0 ? ' positive' : ''}`}>{line.qty}</span>
                <button className="qty-btn" onClick={() => changeQty(line.name, 1)} disabled={isWalletOrder}>＋</button>
              </div>
            </div>
          ))}

          <button
            className="add-item-toggle"
            onClick={() => setShowAddMenu(v => !v)}
            disabled={isWalletOrder}
          >
            {showAddMenu ? '▲ 收起菜單' : '＋ 從菜單新增品項'}
          </button>

          {showAddMenu && !isWalletOrder && menuData && (
            <div className="add-item-list">
              {menuData.categories.map(cat => (
                <div key={cat.id}>
                  <div className="cat-title" style={{ marginTop: 10 }}>{cat.name}</div>
                  {cat.items.filter(i => i.available).map(item => (
                    <div key={item.id} className="add-item-row" onClick={() => addMenuItem(item)}>
                      <span>{item.name}</span>
                      <span className="add-item-price">${item.price} ＋</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="order-options" style={{ marginTop: 16 }}>
            <div className="option-row">
              <label className="option-label">折扣券（減免金額）</label>
              <div className="discount-input-wrap">
                <span className="discount-prefix">－ $</span>
                <input
                  className="discount-input"
                  type="number"
                  min="0"
                  value={discount}
                  onChange={e => setDiscount(e.target.value)}
                  disabled={isWalletOrder}
                />
              </div>
            </div>
            <div className="option-row">
              <label className="option-label">付款方式</label>
              <div className="payment-btns">
                <button
                  className={`payment-btn${paymentMethod === 'cash' ? ' active' : ''}`}
                  onClick={() => setPaymentMethod(prev => prev === 'cash' ? '' : 'cash')}
                  disabled={isWalletOrder}
                >
                  💵 現金
                </button>
                <button
                  className={`payment-btn${paymentMethod === 'line_pay' ? ' active' : ''}`}
                  onClick={() => setPaymentMethod(prev => prev === 'line_pay' ? '' : 'line_pay')}
                  disabled={isWalletOrder}
                >
                  💚 LINE Pay
                </button>
                <button
                  className={`payment-btn${paymentMethod === 'wallet' ? ' active' : ''}`}
                  onClick={() => setPaymentMethod(prev => prev === 'wallet' ? '' : 'wallet')}
                  disabled
                  title={isWalletOrder ? '儲值金訂單已扣款，付款方式鎖定' : '儲值金需由顧客掃碼扣款，無法於編輯時指定'}
                >
                  💰 儲值金
                </button>
              </div>
              {!isWalletOrder && (
                <p className="payment-hint">
                  💡 儲值金需由顧客掃 QR Code 扣款，無法於編輯訂單時指定
                </p>
              )}
            </div>
          </div>

          <div className="edit-total-row">
            <span>合計</span>
            <span>
              {discountNum > 0 && <span className="total-original">${subtotal} </span>}
              ${total}
            </span>
          </div>

          <div style={{ marginTop: 16 }}>
            {isWalletOrder ? (
              !confirmVoid ? (
                <button className="delete-order-btn" onClick={() => setConfirmVoid(true)}>
                  ↩️ 退款作廢（退回顧客儲值金）
                </button>
              ) : (
                <div className="delete-confirm">
                  <span>確定退款作廢？將退回 ${orderTotal} 至顧客錢包，此動作無法復原</span>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="btn outline" style={{ flex: 1, padding: '8px 0' }} onClick={() => setConfirmVoid(false)} disabled={voiding}>
                      取消
                    </button>
                    <button className="btn" style={{ flex: 1, padding: '8px 0', background: 'var(--danger)' }} onClick={handleVoid} disabled={voiding}>
                      {voiding ? '處理中…' : '確認退款作廢'}
                    </button>
                  </div>
                </div>
              )
            ) : !confirmDelete ? (
              <button className="delete-order-btn" onClick={() => setConfirmDelete(true)}>
                🗑 刪除整筆訂單
              </button>
            ) : (
              <div className="delete-confirm">
                <span>確定刪除？此動作無法復原</span>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn outline" style={{ flex: 1, padding: '8px 0' }} onClick={() => setConfirmDelete(false)}>
                    取消
                  </button>
                  <button className="btn" style={{ flex: 1, padding: '8px 0', background: 'var(--danger)' }} onClick={handleDelete}>
                    確認刪除
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
