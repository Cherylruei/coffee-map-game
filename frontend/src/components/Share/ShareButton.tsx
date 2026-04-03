import { useState } from 'react';
import { shareAPI } from '../../utils/api';
import { useAuthStore } from '../../hooks/useAuth';
import { useCollectionStore } from '../../hooks/useCollection';
import { CARDS } from '../../utils/cards';

interface ShareButtonProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShareButton({ isOpen, onClose }: ShareButtonProps) {
  const { user } = useAuthStore();
  const { collection, shareTokens } = useCollectionStore();
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(false);

  if (!user || shareTokens <= 0) return null;

  const handleShare = async (cardId: number) => {
    setLoading(true);
    try {
      const response = await shareAPI.create(cardId);
      setShareUrl(response.data.shareUrl);
    } catch (error: any) {
      console.error('分享失敗:', error);
      alert(error.response?.data?.message || '分享失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
    alert('連結已複製到剪貼簿！');
  };

  const handleClose = () => {
    onClose();
    setShareUrl('');
  };

  // 取得可分享的卡片（數量 > 1）
  const shareableCards = Object.entries(collection)
    .filter(([, count]) => count > 1)
    .map(([cardId]) => parseInt(cardId));

  if (!isOpen) return null;

  return (
    <div
      className='share-modal'
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        // width: '100vw',
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
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 20px 0' }}>分享卡片</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          剩餘分享次數: {shareTokens}/3
        </p>

        {!shareUrl ? (
          <>
            <p style={{ marginBottom: '15px' }}>
              選擇要分享的卡片（僅顯示數量 &gt; 1 的卡片）:
            </p>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
            >
              {shareableCards.length === 0 ? (
                <p style={{ color: '#999' }}>目前沒有可分享的卡片</p>
              ) : (
                shareableCards.map((cardId) => (
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
                    {CARDS[cardId].name} ({CARDS[cardId].rarity}) ×
                    {collection[cardId]}
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <p style={{ marginBottom: '15px' }}>分享連結已生成！</p>
            <div
              style={{
                background: '#f0f0f0',
                padding: '12px',
                borderRadius: '8px',
                marginBottom: '15px',
                wordBreak: 'break-all',
              }}
            >
              {shareUrl}
            </div>
            <button
              onClick={copyToClipboard}
              style={{
                background: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 24px',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              複製連結
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
