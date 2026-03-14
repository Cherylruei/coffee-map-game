import { useEffect, useState } from 'react';
import { LoginButton } from './components/Auth/LoginButton';
import { UserAvatar } from './components/Auth/UserAvatar';
import { QRScanner } from './components/QRScanner/Scanner';
import { GachaAnimation } from './components/Card/GachaAnimation';
import { TreasureBox } from './components/Collection/TreasureBox';
import { ShareButton } from './components/Share/ShareButton';
import { FloatingSidebar } from './components/FloatingSidebar/FloatingSidebar';
import { useAuthStore } from './hooks/useAuth';
import { useCollectionStore } from './hooks/useCollection';
import { authAPI, userAPI, gachaAPI, shareAPI } from './utils/api';
import './App.css';

// 模組層級變數，StrictMode 的 unmount/remount 不會重置
let lineCodeProcessing = false;

function App() {
  const { isAuthenticated, setAuth } = useAuthStore();
  const { collection, shareTokens, setCollection, setShareTokens, addCard } =
    useCollectionStore();
  const [showScanner, setShowScanner] = useState(false);
  const [gachaResult, setGachaResult] = useState<{
    cardId: number;
    isNew: boolean;
  } | null>(null);
  const [treasureOpen, setTreasureOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // 載入收藏資料
  const loadCollection = async () => {
    try {
      const response = await userAPI.getCollection();
      if (response.data.success) {
        setCollection(response.data.collection);
        setShareTokens(response.data.shareTokens);
      }
    } catch (error) {
      console.error('載入收藏失敗:', error);
    }
  };

  // 處理 LINE Login 回調 & 分享領取
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const shareCode = urlParams.get('share');

    if (code && !lineCodeProcessing) {
      lineCodeProcessing = true;
      // 立即清掉 URL 中的 code，避免重新整理時再次使用過期 code
      window.history.replaceState({}, document.title, '/');

      // 用 async IIFE，所有 setState 都在 await 之後執行，避免 cascading renders
      (async () => {
        try {
          const redirectUri = window.location.origin;
          const response = await authAPI.lineCallback(code, redirectUri);
          if (response.data.success) {
            setAuth(response.data.user, response.data.token);
            await loadCollection();
          }
        } catch (error) {
          console.error('LINE Login 失敗:', error);
          alert('登入失敗，請稍後再試');
        }
      })();
    } else if (shareCode && isAuthenticated) {
      (async () => {
        try {
          const response = await shareAPI.claim(shareCode);
          if (response.data.success) {
            // 所有 setState 都在 await 之後，React 18 自動 batch 合併
            setGachaResult({
              cardId: response.data.card.id,
              isNew: response.data.isNew,
            });
            setCollection(response.data.collection);
            addCard(response.data.card.id);
            window.history.replaceState({}, document.title, '/');
          }
        } catch (error: any) {
          console.error('領取分享失敗:', error);
          alert(error.response?.data?.message || '領取失敗，請稍後再試');
        }
      })();
    }
  }, [isAuthenticated]);

  // QR Code 掃描成功處理
  const handleQRScan = async (qrCode: string) => {
    setShowScanner(false);

    try {
      const response = await gachaAPI.pull(qrCode);

      if (response.data.success) {
        setGachaResult({
          cardId: response.data.card.id,
          isNew: response.data.isNew,
        });

        // 更新收藏
        setCollection(response.data.collection);
        addCard(response.data.card.id);
      }
    } catch (error: any) {
      console.error('抽卡失敗:', error);
      alert(error.response?.data?.message || '抽卡失敗，請稍後再試');
    }
  };

  return (
    <div className='app'>
      {/* 右上角頭像 */}
      <UserAvatar />

      {/* 主內容 */}
      <div className='main-content'>
        {!isAuthenticated ? (
          <div className='login-screen'>
            <h1>☕ 咖啡地圖收集遊戲 ☕</h1>
            <p>掃描店家 QR Code，收集世界各地咖啡產地卡片！</p>
            <LoginButton />
          </div>
        ) : (
          <div className='game-screen'>
            <h1>☕ 咖啡地圖</h1>
            <p>掃描 QR Code 開始收集咖啡卡片！</p>

            {!showScanner ? (
              <button
                onClick={() => setShowScanner(true)}
                className='scan-button'
              >
                📱 掃描 QR Code
              </button>
            ) : (
              <div className='scanner-container'>
                <QRScanner
                  onScanSuccess={handleQRScan}
                  onScanError={(error) => console.error(error)}
                />
                <button
                  onClick={() => setShowScanner(false)}
                  className='cancel-button'
                >
                  取消
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 抽卡動畫 */}
      {gachaResult && (
        <GachaAnimation
          cardId={gachaResult.cardId}
          isNew={gachaResult.isNew}
          onComplete={() => setGachaResult(null)}
        />
      )}

      {/* 側邊欄 */}
      {isAuthenticated && (
        <FloatingSidebar
          onTreasureClick={() => setTreasureOpen(true)}
          onShareClick={() => setShareOpen(true)}
          collectedCount={Object.keys(collection).length}
          shareTokens={shareTokens}
        />
      )}

      {/* 寶盒圖鑑 */}
      <TreasureBox
        isOpen={treasureOpen}
        onClose={() => setTreasureOpen(false)}
      />

      {/* 分享彈窗 */}
      <ShareButton isOpen={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}

export default App;
