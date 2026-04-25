import { useState, useEffect } from 'react';
import { Order, OrderItem, MenuData, MenuItem, PaymentMethod } from '../types';
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    order.paymentMethod ?? order.payment_method ?? 'cash'
  );
  const [menuData, setMenuData] = useState<MenuData | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const showDialog = useDialog();

  const orderId = order.id;

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
      showDialog({ type: 'error', title: '刪除失敗，請稍後再試' });
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
          <button className="btn" style={{ padding: '7px 14px', fontSize: '0.85rem' }} onClick={handleSave} disabled={saving}>
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>

        <div className="edit-modal-body">
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
                <button className="qty-btn" onClick={() => changeQty(line.name, -1)}>－</button>
                <span className={`qty-num${line.qty > 0 ? ' positive' : ''}`}>{line.qty}</span>
                <button className="qty-btn" onClick={() => changeQty(line.name, 1)}>＋</button>
              </div>
            </div>
          ))}

          <button
            className="add-item-toggle"
            onClick={() => setShowAddMenu(v => !v)}
          >
            {showAddMenu ? '▲ 收起菜單' : '＋ 從菜單新增品項'}
          </button>

          {showAddMenu && menuData && (
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
                />
              </div>
            </div>
            <div className="option-row">
              <label className="option-label">付款方式</label>
              <div className="payment-btns">
                <button
                  className={`payment-btn${paymentMethod === 'cash' ? ' active' : ''}`}
                  onClick={() => setPaymentMethod('cash')}
                >
                  💵 現金
                </button>
                <button
                  className={`payment-btn${paymentMethod === 'line_pay' ? ' active' : ''}`}
                  onClick={() => setPaymentMethod('line_pay')}
                >
                  💚 LINE Pay
                </button>
              </div>
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
            {!confirmDelete ? (
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
