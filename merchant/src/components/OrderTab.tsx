import { useState, useEffect } from 'react';
import {
  MenuData,
  MenuItem,
  QRCodeItem,
  PendingOrder,
  PaymentMethod,
} from '../types';
import { api, API_BASE } from '../utils/api';
import { QRViewer } from './QRViewer';

interface Props {
  sessionToken: string;
  staffName: string;
  staffLineId: string | null;
  onOrderCommitted: () => void;
  onQRViewerChange?: (open: boolean) => void;
}

export function OrderTab({
  sessionToken,
  staffName,
  staffLineId,
  onOrderCommitted,
  onQRViewerChange,
}: Props) {
  const [menuData, setMenuData] = useState<MenuData | null>(null);
  const [menuError, setMenuError] = useState(false);
  const [orderItems, setOrderItems] = useState<Record<string, number>>({});
  const [discount, setDiscount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [employeeId, setEmployeeId] = useState('');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerQR, setViewerQR] = useState<QRCodeItem | null>(null);
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/menu`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setMenuData({ categories: data.categories });
        else setMenuError(true);
      })
      .catch(() => setMenuError(true));
  }, []);

  function changeQty(itemId: string, delta: number) {
    setOrderItems((prev) => {
      const cur = prev[itemId] || 0;
      const next = Math.max(0, cur + delta);
      const updated = { ...prev };
      if (next === 0) delete updated[itemId];
      else updated[itemId] = next;
      return updated;
    });
  }

  const allItems: MenuItem[] =
    menuData?.categories.flatMap((c) => c.items) || [];
  const customCategoryId = menuData?.categories?.find(
    (c) => c.id === 'custom',
  )?.id;

  let totalCups = 0;
  let totalAmount = 0;
  let qrCups = 0; // 用於 QR Code 的杯子數（不含客製項）
  for (const item of allItems) {
    const qty = orderItems[item.id] || 0;
    if (qty === 0) continue;
    totalCups += qty;
    totalAmount += item.price * qty;
    // 只有非客製項才計入 QR Code 杯數
    const itemCategory = menuData?.categories?.find((c) =>
      c.items.some((i) => i.id === item.id),
    );
    if (itemCategory?.id !== 'custom') {
      qrCups += qty;
    }
  }
  const discountNum = Math.max(0, parseInt(discount) || 0);
  const finalAmount = Math.max(0, totalAmount - discountNum);

  async function openQRViewer() {
    if (qrCups === 0) {
      alert('請至少點一杯咖啡（客製項不產生 QR Code）');
      return;
    }
    setGenerating(true);

    const orderLines = allItems
      .filter((item) => (orderItems[item.id] || 0) > 0)
      .map((item) => ({
        ...item,
        qty: orderItems[item.id],
      }));

    const data = await api<{ success: boolean; qrCode: QRCodeItem }>(
      '/api/admin/qrcode/generate',
      sessionToken,
      {
        method: 'POST',
        body: JSON.stringify({ cupCount: qrCups, expiresInDays: 30 }),
      },
    );
    setGenerating(false);

    if (!data?.success) return;

    setViewerQR(data.qrCode);
    setPendingOrder({
      staffLineId,
      staffName,
      items: orderLines.map((l) => ({
        name: l.name,
        qty: l.qty,
        price: l.price,
      })),
      totalAmount: finalAmount,
      discount: discountNum,
      paymentMethod,
      employeeId: employeeId.trim(),
      qrCode: data.qrCode.code,
      cupCount: qrCups,
    });
    setViewerOpen(true);
    onQRViewerChange?.(true);
  }

  async function commitAndClose() {
    if (!pendingOrder) return;

    try {
      // 轉換為後端需要的格式（qrCodes 陣列）
      const orderPayload = {
        staffLineId: pendingOrder.staffLineId,
        staffName: pendingOrder.staffName,
        items: pendingOrder.items,
        totalAmount: pendingOrder.totalAmount,
        discount: pendingOrder.discount,
        paymentMethod: pendingOrder.paymentMethod,
        employeeId: pendingOrder.employeeId,
        qrCodes: [pendingOrder.qrCode],
      };

      console.log('提交訂單:', orderPayload);
      const result = await api('/api/admin/order', sessionToken, {
        method: 'POST',
        body: JSON.stringify(orderPayload),
      });

      console.log('訂單提交結果:', result);

      if (result && (result as any).success) {
        alert('✅ 訂單已記錄');
        onOrderCommitted();
        closeViewer();
      } else {
        const errorMsg = (result as any)?.message || '訂單記錄失敗，請稍後再試';
        console.error('訂單提交失敗:', result);
        alert(`❌ ${errorMsg}`);
      }
    } catch (error) {
      console.error('訂單提交錯誤:', error);
      alert('❌ 訂單提交失敗，請確認網路連線');
    }
  }

  function cancelViewer() {
    setPendingOrder(null);
    closeViewer();
  }

  function closeViewer() {
    setViewerOpen(false);
    onQRViewerChange?.(false);
    setViewerQR(null);
    setOrderItems({});
    setDiscount('');
    setPaymentMethod('cash');
    setEmployeeId('');
  }

  if (menuError) {
    return (
      <p
        style={{
          color: 'var(--danger)',
          textAlign: 'center',
          padding: '40px 0',
        }}
      >
        菜單載入失敗
      </p>
    );
  }
  if (!menuData) {
    return (
      <p
        style={{
          color: 'var(--muted)',
          textAlign: 'center',
          padding: '40px 0',
        }}
      >
        菜單載入中…
      </p>
    );
  }

  return (
    <>
      {/* 菜單：跳過無可供應品項的分類 */}
      {menuData.categories
        .filter((cat) => cat.items.some((i) => i.available))
        .map((cat) => (
        <div key={cat.id}>
          <div className='cat-title'>{cat.name}</div>
          {cat.items
            .filter((i) => i.available)
            .map((item) => {
              const qty = orderItems[item.id] || 0;
              return (
                <div key={item.id} className='menu-item'>
                  <div className='item-info'>
                    <div className='item-name'>{item.name}</div>
                    <div className='item-price'>${item.price}</div>
                  </div>
                  <div className='qty-ctrl'>
                    <button
                      className='qty-btn'
                      onClick={() => changeQty(item.id, -1)}
                    >
                      －
                    </button>
                    <span className={`qty-num${qty > 0 ? ' positive' : ''}`}>
                      {qty}
                    </span>
                    <button
                      className='qty-btn'
                      onClick={() => changeQty(item.id, 1)}
                    >
                      ＋
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      ))}

      {/* 折扣券 / 付款 / 員編 */}
      {totalCups > 0 && (
        <div className='order-options'>
          <div className='option-row'>
            <label className='option-label'>折扣券（減免金額）</label>
            <div className='discount-input-wrap'>
              <span className='discount-prefix'>－ $</span>
              <input
                className='discount-input'
                type='number'
                min='0'
                placeholder='0'
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
          </div>

          <div className='option-row'>
            <label className='option-label'>付款方式</label>
            <div className='payment-btns'>
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

          <div className='option-row'>
            <label className='option-label'>員編（選填）</label>
            <input
              className='employee-input'
              type='text'
              placeholder='輸入顧客員編'
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* 底部訂單欄 */}
      <div className='order-bar'>
        <div className='order-bar-info'>
          {totalCups === 0 ? (
            <div>尚未選取品項</div>
          ) : (
            <>
              <div>
                共 {totalCups} 杯・
                {paymentMethod === 'cash' ? '現金' : 'LINE Pay'}
              </div>
              <div className='total-amount'>
                {discountNum > 0 ? (
                  <>
                    <span className='total-original'>${totalAmount}</span> → $
                    {finalAmount}
                  </>
                ) : (
                  <>${finalAmount}</>
                )}
              </div>
            </>
          )}
        </div>
        <button
          className='btn'
          onClick={openQRViewer}
          disabled={totalCups === 0 || generating}
        >
          {generating ? '生成中…' : '生成 QR'}
        </button>
      </div>

      {viewerOpen && viewerQR && (
        <QRViewer
          qrCode={viewerQR}
          cupCount={pendingOrder?.cupCount || 1}
          pendingOrder={pendingOrder}
          onCommit={commitAndClose}
          onCancel={cancelViewer}
        />
      )}
    </>
  );
}
