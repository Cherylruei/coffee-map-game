import { useEffect, useRef, useState } from 'react';
import { LoginButton } from './components/Auth/LoginButton';
import { UserAvatar } from './components/Auth/UserAvatar';
import { QRScanner } from './components/QRScanner/Scanner';
import { GachaAnimation } from './components/Card/GachaAnimation';
import { TreasureBox } from './components/Collection/TreasureBox';
import { ShareButton } from './components/Share/ShareButton';
import { FloatingSidebar } from './components/FloatingSidebar/FloatingSidebar';
import { MenuOverlay } from './components/MenuOverlay/MenuOverlay';
import { useAuthStore } from './hooks/useAuth';
import { useCollectionStore } from './hooks/useCollection';
import { authAPI, userAPI, gachaAPI, shareAPI } from './utils/api';
import './App.css';

// 模組層級變數，StrictMode 的 unmount/remount 不會重置
let lineCodeProcessing = false;
let qrCodeProcessing = false;

function App() {
  const { isAuthenticated, setAuth } = useAuthStore();
  const { collection, shareTokens, setCollection, setShareTokens } =
    useCollectionStore();
  const [showScanner, setShowScanner] = useState(false);
  const [gachaResult, setGachaResult] = useState<{
    cardId: number;
    isNew: boolean;
  } | null>(null);
  const [treasureOpen, setTreasureOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChestHint, setShowChestHint] = useState(false);
  const [lastCardId, setLastCardId] = useState<number | null>(null);
  // 記錄抽卡前的收藏數，判斷是否為第一張
  const collectionCountRef = useRef(0);

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
      window.history.replaceState({}, document.title, '/');

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
            setGachaResult({
              cardId: response.data.card.id,
              isNew: response.data.isNew,
            });
            setCollection(response.data.collection);
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
  // 不在此處關閉 scanner，等動畫結束才返回主頁，讓使用者看到卡片飛入寶箱
  const handleQRScan = async (rawQR: string) => {
    // 防止重複掃描
    if (qrCodeProcessing) {
      console.log('掃描進行中，忽略此次掃描');
      return;
    }
    qrCodeProcessing = true;

    try {
      // 記錄抽卡前的收藏數
      collectionCountRef.current = Object.keys(collection).length;

      // 支援掃到完整 URL（如 https://xxx/?qr=COFFEE-XXXX）或直接是代碼
      let qrCode = rawQR;
      try {
        const url = new URL(rawQR);
        const param = url.searchParams.get('qr');
        if (param) qrCode = param;
      } catch {
        // rawQR 本身就是代碼，直接使用
      }

      const response = await gachaAPI.pull(qrCode);

      if (response.data.success) {
        setGachaResult({
          cardId: response.data.card.id,
          isNew: response.data.isNew,
        });
        setCollection(response.data.collection);
      }
    } catch (error: any) {
      console.error('抽卡失敗:', error);
      // 只有在錯誤時才重新開啟掃描器
      qrCodeProcessing = false;
      alert(error.response?.data?.message || '抽卡失敗，請稍後再試');
    }
  };

  // 動畫結束後：關閉 scanner 返回主頁，若是第一張顯示寶箱提示
  const handleGachaComplete = () => {
    const wasFirstCard = collectionCountRef.current === 0;
    if (gachaResult) setLastCardId(gachaResult.cardId);
    setGachaResult(null);
    setShowScanner(false); // 返回主掃描頁
    qrCodeProcessing = false; // 重置掃描鎖
    if (wasFirstCard) {
      setShowChestHint(true);
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
            <button className='menu-button' onClick={() => setMenuOpen(true)}>
              📋 查看菜單
            </button>
          </div>
        ) : (
          <div className='game-screen'>
            <h1>☕ 咖啡地圖</h1>
            <p>掃描 QR Code 開始收集咖啡卡片！</p>

            {!showScanner ? (
              <div className='action-buttons'>
                <button
                  onClick={() => setShowScanner(true)}
                  className='scan-button'
                >
                  📱 掃描 QR Code
                </button>
                <button
                  className='menu-button'
                  onClick={() => setMenuOpen(true)}
                >
                  📋 查看菜單
                </button>
              </div>
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

      {/* 抽卡動畫 — 在 scanner 之上，動畫結束才關 scanner */}
      {gachaResult && (
        <GachaAnimation
          cardId={gachaResult.cardId}
          isNew={gachaResult.isNew}
          onComplete={handleGachaComplete}
        />
      )}

      {/* 側邊欄 — z-index 10001，在抽卡動畫 collecting 時可見（收卡飛向寶箱） */}
      {isAuthenticated && (
        <FloatingSidebar
          onTreasureClick={() => {
            setTreasureOpen(true);
            setShowChestHint(false);
          }}
          onShareClick={() => setShareOpen(true)}
          collectedCount={Object.keys(collection).length}
          shareTokens={shareTokens}
          showChestHint={showChestHint}
        />
      )}

      {/* 寶盒圖鑑 */}
      <TreasureBox
        isOpen={treasureOpen}
        onClose={() => setTreasureOpen(false)}
        lastCardId={lastCardId}
      />

      {/* 分享彈窗 */}
      <ShareButton isOpen={shareOpen} onClose={() => setShareOpen(false)} />

      {/* 菜單瀏覽 */}
      <MenuOverlay isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}

export default App;
