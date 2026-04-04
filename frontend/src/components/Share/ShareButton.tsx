import { useState } from 'react';
import { shareAPI, userAPI } from '../../utils/api';
import { useAuthStore } from '../../hooks/useAuth';
import { useCollectionStore } from '../../hooks/useCollection';
import { CARDS } from '../../utils/cards';


interface ShareButtonProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShareButton({ isOpen, onClose }: ShareButtonProps) {
  const { user } = useAuthStore();
  const { collection, pendingShares, shareTokens, setCollection, setShareTokens, setPendingShares } = useCollectionStore();
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [cancellingCardId, setCancellingCardId] = useState<number | null>(null);
  const [cardName, setCardName] = useState('');

  if (!user || shareTokens <= 0) return null;

  // 重新加載最新的集合和分享次數
  const reloadCollection = async () => {
    try {
      const response = await userAPI.getCollection();
      if (response.data.success) {
        setCollection(response.data.collection);
        setPendingShares(response.data.pendingShares || {});
        setShareTokens(response.data.shareTokens);
      }
    } catch (error) {
      console.error('重新載入集合失敗:', error);
    }
  };

  const handleShare = async (cardId: number) => {
    setLoading(true);
    try {
      const response = await shareAPI.create(cardId);
      setShareUrl(response.data.shareUrl);
      setCardName(CARDS[cardId].name);
      // 分享成功，重新載入集合以同步待接收狀態
      await reloadCollection();
    } catch (error: any) {
      console.error('分享失敗:', error);
      // 分享失敗，重新加載最新數據
      await reloadCollection();
      alert(error.response?.data?.message || '分享失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const handleWebShare = async () => {
    if (!shareUrl) {
      alert('連結尚未生成');
      return;
    }

    // 檢查瀏覽器是否支援 Web Share API
    if (!navigator.share) {
      // 不支援時，提供複製連結的備選方案
      try {
        await navigator.clipboard.writeText(shareUrl);
        alert('連結已複製到剪貼簿！');
      } catch {
        alert('無法複製連結，請手動複製');
      }
      return;
    }

    try {
      await navigator.share({
        title: `☕ 咖啡地圖 - ${cardName}`,
        text: `我想分享 ${cardName} 給你！快來領取，一起集卡吧！`,
        url: shareUrl,
      });
      // 分享成功後，關閉並重置
      setTimeout(() => {
        handleClose();
      }, 500);
    } catch (error: any) {
      // 用戶取消分享時不顯示錯誤
      if (error.name !== 'AbortError') {
        console.error('分享出錯:', error);
        alert('分享失敗，請稍後再試');
      }
    }
  };

  const handleClose = () => {
    onClose();
    setShareUrl('');
    setCardName('');
  };

  // 取消分享
  const handleCancelShare = async (cardId: number) => {
    setCancellingCardId(cardId);
    try {
      const response = await shareAPI.cancel(cardId);
      if (response.data.success) {
        // 取消成功，重新載入集合以同步狀態
        await reloadCollection();
      }
    } catch (error: any) {
      console.error('取消分享失敗:', error);
      alert(error.response?.data?.message || '取消分享失敗，請稍後再試');
    } finally {
      setCancellingCardId(null);
    }
  };

  // 取得可分享的卡片（數量 > 1 且沒有待接收）
  const shareableCards = Object.entries(collection)
    .filter(([cardId, count]) => {
      const pending = pendingShares[parseInt(cardId)] || 0;
      return count > 1 && pending === 0; // 只有數量大於1且沒有待接收的才可以分享
    })
    .map(([cardId]) => parseInt(cardId));

  // 取得待接收中的卡片
  const pendingCards = Object.entries(collection)
    .filter(([cardId]) => (pendingShares[parseInt(cardId)] || 0) > 0)
    .map(([cardId]) => parseInt(cardId));

  if (!isOpen) return null;

  return (
    <div
      className='share-modal'
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        height: '100vh',
        background: 'rgba(0,0,0,0.8)',
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '16px',
          padding: '30px',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 20px 0' }}>分享卡片</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          剩餘分享次數: {shareTokens}/3
        </p>

        {!shareUrl ? (
          <>
            {/* 可分享的卡片 */}
            {shareableCards.length > 0 && (
              <>
                <p style={{ marginBottom: '15px', fontWeight: 'bold' }}>
                  ✓ 可分享的卡片：
                </p>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}
                >
                  {shareableCards.map((cardId) => (
                    <button
                      key={cardId}
                      onClick={() => handleShare(cardId)}
                      disabled={loading}
                      style={{
                        padding: '12px',
                        background: '#f0f0f0',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {CARDS[cardId].name} ({CARDS[cardId].rarity}) × {collection[cardId]}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* 待接收的卡片 */}
            {pendingCards.length > 0 && (
              <>
                <p style={{ marginBottom: '15px', fontWeight: 'bold', color: '#ff9800' }}>
                  ⏳ 待對方接收中：
                </p>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}
                >
                  {pendingCards.map((cardId) => (
                    <div
                      key={cardId}
                      style={{
                        padding: '12px',
                        background: '#e0e0e0',
                        border: '2px dashed #999',
                        borderRadius: '8px',
                        opacity: 0.8,
                        color: '#666',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                      }}
                    >
                      <span style={{ flex: 1 }}>
                        {CARDS[cardId].name} ({CARDS[cardId].rarity}) × {collection[cardId]}
                        <span style={{ marginLeft: '8px', fontSize: '12px' }}>⏳ 等待中...</span>
                      </span>
                      <button
                        onClick={() => handleCancelShare(cardId)}
                        disabled={cancellingCardId === cardId}
                        style={{
                          padding: '6px 12px',
                          background: cancellingCardId === cardId ? '#ccc' : '#e74c3c',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: cancellingCardId === cardId ? 'not-allowed' : 'pointer',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cancellingCardId === cardId ? '取消中...' : '取消分享'}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* 沒有可分享的卡片 */}
            {shareableCards.length === 0 && pendingCards.length === 0 && (
              <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>
                目前沒有可分享的卡片
              </p>
            )}
          </>
        ) : (
          <>
            <p style={{ marginBottom: '15px' }}>🎉 分享連結已生成！</p>
            <div
              style={{
                background: '#f0f0f0',
                padding: '12px',
                borderRadius: '8px',
                marginBottom: '15px',
                wordBreak: 'break-all',
                fontSize: '12px',
                fontFamily: 'monospace',
              }}
            >
              {shareUrl}
            </div>
            <button
              onClick={handleWebShare}
              style={{
                background: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 24px',
                cursor: 'pointer',
                width: '100%',
                fontWeight: 'bold',
                fontSize: '16px',
              }}
            >
              📤 分享到（LINE、訊息、Facebook...）
            </button>
          </>
        )}

        <button
          onClick={handleClose}
          style={{
            marginTop: '15px',
            background: '#ccc',
            color: '#333',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 20px',
            cursor: 'pointer',
            width: '100%',
          }}
        >
          關閉
        </button>
      </div>
    </div>
  );
}
