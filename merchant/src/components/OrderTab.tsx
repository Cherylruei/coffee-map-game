import { useState, useEffect } from 'react';
import { useDialog } from '../context/DialogContext';
import {
  MenuData,
  MenuItem,
  QRCodeItem,
  PendingOrder,
  OptionalPaymentMethod,
} from '../types';
import { api, API_BASE } from '../utils/api';
import { QRViewer } from './QRViewer';

interface Props {
  sessionToken: string;
  staffName: string;
  staffLineId: string | null;
  onOrderCommitted: () => void;
  onQRViewerChange?: (open: boolean) => void;
  menuRefreshSignal?: number;
}

export function OrderTab({
  sessionToken,
  staffName,
  staffLineId,
  onOrderCommitted,
  onQRViewerChange,
  menuRefreshSignal,
}: Props) {
  const showDialog = useDialog();
  const [menuData, setMenuData] = useState<MenuData | null>(null);
  const [menuError, setMenuError] = useState(false);
  const [orderItems, setOrderItems] = useState<Record<string, number>>({});
  const [discount, setDiscount] = useState('');
  const [rewardCodeInput, setRewardCodeInput] = useState('');
  const [rewardCodeInfo, setRewardCodeInfo] = useState<{
    code: string;
    rewardType: string;
    expiresAt?: string;
    customerName?: string | null;
    customerLineId?: string | null;
  } | null>(null);
  const [rewardItemName, setRewardItemName] = useState('');

  // DEBUG: 追蹤 rewardCodeInfo 變化 with stack trace
  useEffect(() => {
    console.log('[TRACK] rewardCodeInfo changed:', rewardCodeInfo);
    if (rewardCodeInfo === null) {
      console.trace('[TRACE] rewardCodeInfo set to null from:');
    }
  }, [rewardCodeInfo]);
  const [checkingRewardCode, setCheckingRewardCode] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<OptionalPaymentMethod>('');
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
  }, [menuRefreshSignal]);

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
  const orderLines = allItems
    .filter((item) => (orderItems[item.id] || 0) > 0)
    .map((item) => ({
      ...item,
      qty: orderItems[item.id],
    }));
  const redeemableItems = orderLines.filter((item) => item.price > 0);
  const isQrEligibleItem = (itemId: string) => {
    const itemCategory = menuData?.categories?.find((c) =>
      c.items.some((i) => i.id === itemId),
    );
    return itemCategory?.id !== 'custom';
  };

  let totalCups = 0;
  let totalAmount = 0;
  let qrCups = 0;
  for (const item of allItems) {
    const qty = orderItems[item.id] || 0;
    if (qty === 0) continue;
    totalCups += qty;
    totalAmount += item.price * qty;
    if (isQrEligibleItem(item.id)) {
      qrCups += qty;
    }
  }

  const selectedRewardItem = rewardCodeInfo
    ? redeemableItems.find((item) => item.name === rewardItemName) || null
    : null;
  const rewardDiscount = selectedRewardItem?.price || 0;
  const qrEligibleCups = Math.max(
    0,
    qrCups -
      (selectedRewardItem && isQrEligibleItem(selectedRewardItem.id) ? 1 : 0),
  );
  const discountNum = Math.max(0, parseInt(discount) || 0);
  const totalDiscount = discountNum + rewardDiscount;
  const finalAmount = Math.max(0, totalAmount - totalDiscount);

  function paymentLabel(method: OptionalPaymentMethod) {
    if (method === 'cash') return '現金';
    if (method === 'line_pay') return 'LINE Pay';
    if (method === 'wallet') return '儲值金';
    return '未選擇';
  }

  useEffect(() => {
    if (!rewardCodeInfo) {
      if (rewardItemName) {
        console.log('[DEBUG] useEffect: rewardCodeInfo is null, clearing rewardItemName');
        setRewardItemName('');
      }
      return;
    }

    const hasSelectedItem = redeemableItems.some(
      (item) => item.name === rewardItemName,
    );
    if (!hasSelectedItem) {
      console.log('[DEBUG] useEffect: rewardItemName not found in redeemableItems, setting to:', redeemableItems[0]?.name);
      setRewardItemName(redeemableItems[0]?.name || '');
    }
  }, [redeemableItems, rewardCodeInfo, rewardItemName]);

  async function applyRewardCode() {
    const trimmedCode = rewardCodeInput.trim().toUpperCase();
    if (!trimmedCode) {
      showDialog({ type: 'warning', title: '請先輸入兌換碼' });
      return;
    }
    if (redeemableItems.length === 0) {
      showDialog({ type: 'warning', title: '請先選擇至少一杯可兌換飲品' });
      return;
    }

    setCheckingRewardCode(true);
    const result = await api<{
      success: boolean;
      message?: string;
      rewardCode?: {
        code: string;
        rewardType: string;
        expiresAt?: string;
        customerName?: string | null;
        customerLineId?: string | null;
      };
    }>('/api/admin/redeem-code/preview', sessionToken, {
      method: 'POST',
      body: JSON.stringify({ code: trimmedCode }),
    });
    setCheckingRewardCode(false);

    if (!result?.success || !result.rewardCode) {
      showDialog({
        type: 'error',
        title: result?.message || '兌換碼驗證失敗，請稍後再試',
      });
      return;
    }

    console.log('[DEBUG] applyRewardCode success, setting rewardCodeInfo:', result.rewardCode);
    setRewardCodeInfo(result.rewardCode);
    setRewardCodeInput(result.rewardCode.code);
    const selectedItemName = redeemableItems.some((item) => item.name === (redeemableItems[0]?.name || ''))
      ? (redeemableItems[0]?.name || '')
      : (redeemableItems[0]?.name || '');
    console.log('[DEBUG] setting rewardItemName to:', selectedItemName);
    setRewardItemName(selectedItemName);
    showDialog({ type: 'success', title: '兌換碼已套用，請選擇本次免費飲品' });
  }

  function clearRewardCode() {
    console.log('[DEBUG] clearRewardCode called');
    console.trace('[TRACE] clearRewardCode stack trace:');
    setRewardCodeInput('');
    setRewardCodeInfo(null);
    setRewardItemName('');
  }

  async function submitOrder(orderDraft: PendingOrder) {
    try {
      const orderPayload = {
        staffLineId: orderDraft.staffLineId,
        staffName: orderDraft.staffName,
        items: orderDraft.items,
        totalAmount: orderDraft.totalAmount,
        discount: orderDraft.discount,
        paymentMethod: orderDraft.paymentMethod || null,
        employeeId: orderDraft.employeeId,
        qrCodes: orderDraft.qrCode ? [orderDraft.qrCode] : [],
        rewardCode: orderDraft.rewardCode,
        rewardItemName: orderDraft.rewardItemName,
      };

      const result = await api('/api/admin/order', sessionToken, {
        method: 'POST',
        body: JSON.stringify(orderPayload),
      });

      if (result && (result as any).success) {
        showDialog({ type: 'success', title: '訂單已記錄' });
        onOrderCommitted();
        closeViewer();
        return true;
      }

      const errorMsg = (result as any)?.message || '訂單記錄失敗，請稍後再試';
      showDialog({ type: 'error', title: errorMsg });
      return false;
    } catch (error) {
      console.error('訂單提交錯誤:', error);
      showDialog({ type: 'error', title: '訂單提交失敗，請確認網路連線' });
      return false;
    }
  }

  async function openQRViewer() {
    if (rewardCodeInfo && !rewardItemName) {
      showDialog({ type: 'warning', title: '請先選擇本次免費兌換的飲品' });
      return;
    }
    // 檢查：有輸入兌換碼但尚未套用
    if (rewardCodeInput.trim() && !rewardCodeInfo) {
      showDialog({ type: 'warning', title: '兌換碼尚未套用，請先點選「套用」按鈕驗證兌換碼' });
      return;
    }
    if (totalCups === 0) {
      showDialog({ type: 'warning', title: '請至少選擇一個品項' });
      return;
    }

    // DEBUG: 列印計算狀態
    console.log('=== openQRViewer DEBUG ===');
    console.log('totalCups:', totalCups);
    console.log('qrCups:', qrCups);
    console.log('rewardCodeInfo:', rewardCodeInfo);
    console.log('rewardItemName:', rewardItemName);
    console.log('selectedRewardItem:', selectedRewardItem);
    console.log('isQrEligibleItem(selectedRewardItem.id):', selectedRewardItem ? isQrEligibleItem(selectedRewardItem.id) : 'N/A');
    console.log('qrEligibleCups:', qrEligibleCups);
    console.log('orderLines:', orderLines);
    console.log('redeemableItems:', redeemableItems);

    setGenerating(true);

    const orderDraft: PendingOrder = {
      staffLineId,
      staffName,
      items: orderLines.map((l) => ({
        name: l.name,
        qty: l.qty,
        price: l.price,
      })),
      totalAmount: finalAmount,
      discount: totalDiscount,
      paymentMethod,
      employeeId: employeeId.trim(),
      qrCode: null,
      cupCount: qrEligibleCups,
      rewardCode: rewardCodeInfo?.code || null,
      rewardItemName: rewardItemName || null,
      rewardDiscount,
    };

    if (qrEligibleCups <= 0) {
      console.log('qrEligibleCups <= 0，直接提交訂單，不產生 QR');
      await submitOrder(orderDraft);
      setGenerating(false);
      return;
    }

    console.log('qrEligibleCups > 0，產生 QR Code');

    const body: Record<string, unknown> = {
      cupCount: qrEligibleCups,
      expiresInDays: 30,
    };
    if (paymentMethod === 'wallet' && finalAmount > 0) {
      body.walletAmount = finalAmount;
    }
    const data = await api<{ success: boolean; qrCode: QRCodeItem }>(
      '/api/admin/qrcode/generate',
      sessionToken,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
    setGenerating(false);

    if (!data?.success) return;

    const pendingWithQr = {
      ...orderDraft,
      qrCode: data.qrCode.code,
    };
    setViewerQR(data.qrCode);
    setPendingOrder(pendingWithQr);
    setViewerOpen(true);
    onQRViewerChange?.(true);
  }

  async function commitAndClose() {
    if (!pendingOrder) return;
    await submitOrder(pendingOrder);
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
    clearRewardCode();
    setPaymentMethod('');
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
            <label className='option-label'>集滿兌換碼</label>
            <div style={{ display: 'grid', gap: 8, width: '100%' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className='employee-input'
                  type='text'
                  placeholder='輸入 COF- 開頭兌換碼'
                  value={rewardCodeInput}
                  onChange={(e) => {
                    const nextValue = e.target.value.toUpperCase();
                    setRewardCodeInput(nextValue);
                    
                    // 只在用戶手動修改代碼時才清除已套用的兌換碼
                    // 如果有已套用的兌換碼，且用戶輸入的值與其不符，則清除
                    if (rewardCodeInfo && nextValue.trim() && nextValue.trim() !== (rewardCodeInfo.code || '').trim()) {
                      console.log('[DEBUG] 兌換碼修改，清除已套用的兌換碼資訊');
                      console.trace('[TRACE] rewardCodeInfo cleared from onChange at:');
                      setRewardCodeInfo(null);
                      setRewardItemName('');
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  className='btn outline'
                  type='button'
                  onClick={applyRewardCode}
                  disabled={checkingRewardCode}
                  style={{ whiteSpace: 'nowrap', padding: '8px 12px' }}
                >
                  {checkingRewardCode ? '驗證中…' : rewardCodeInfo ? '重新驗證' : '套用'}
                </button>
                {rewardCodeInfo && (
                  <button
                    className='btn outline'
                    type='button'
                    onClick={clearRewardCode}
                    style={{ whiteSpace: 'nowrap', padding: '8px 12px' }}
                  >
                    清除
                  </button>
                )}
              </div>

              {rewardCodeInfo && (
                <div
                  style={{
                    border: '1px solid rgba(46, 125, 50, 0.24)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    background: 'rgba(46, 125, 50, 0.08)',
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
                    {rewardCodeInfo.customerName
                      ? `核銷對象：${rewardCodeInfo.customerName}`
                      : '兌換碼已通過驗證'}
                    {rewardCodeInfo.expiresAt
                      ? `・效期至 ${new Date(rewardCodeInfo.expiresAt).toLocaleDateString('zh-TW')}`
                      : ''}
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <label className='option-label' style={{ marginBottom: 0 }}>
                      本次免費飲品
                    </label>
                    <select
                      className='employee-input'
                      value={rewardItemName}
                      onChange={(e) => setRewardItemName(e.target.value)}
                    >
                      {redeemableItems.map((item) => (
                        <option key={item.id} value={item.name}>
                          {item.name} ・ ${item.price}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--accent)' }}>
                    本次集滿兌換折抵 ${rewardDiscount}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    被兌換的這一杯不會生成 QR Code，也不會提供抽卡機會。
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className='option-row'>
            <label className='option-label'>付款方式</label>
            <div className='payment-btns'>
              <button
                className={`payment-btn${paymentMethod === 'cash' ? ' active' : ''}`}
                onClick={() => setPaymentMethod((prev) => prev === 'cash' ? '' : 'cash')}
              >
                💵 現金
              </button>
              <button
                className={`payment-btn${paymentMethod === 'line_pay' ? ' active' : ''}`}
                onClick={() => setPaymentMethod((prev) => prev === 'line_pay' ? '' : 'line_pay')}
              >
                💚 LINE Pay
              </button>
              <button
                className={`payment-btn${paymentMethod === 'wallet' ? ' active' : ''}`}
                onClick={() => setPaymentMethod((prev) => prev === 'wallet' ? '' : 'wallet')}
              >
                💰 儲值金
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
                共 {totalCups} 杯・{paymentLabel(paymentMethod)}
                {rewardCodeInfo
                  ? `・抽卡 QR ${qrEligibleCups > 0 ? `${qrEligibleCups} 杯` : '不產生'}`
                  : ''}
              </div>
              <div className='total-amount'>
                {totalDiscount > 0 ? (
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
          {generating ? '點單中…' : '確認點單'}
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
