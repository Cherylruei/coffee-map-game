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

const PENDING_QR_KEY = 'pending_qr_code';

function App() {
  const { isAuthenticated, setAuth } = useAuthStore();
  const {
    collection,
    shareTokens,
    drawChances,
    setCollection,
    setShareTokens,
    setPendingShares,
    setDrawChances,
  } = useCollectionStore();
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
  const [showNoChancesModal, setShowNoChancesModal] = useState(false);
  const [drawingInProgress, setDrawingInProgress] = useState(false);
  // 記錄抽卡前的收藏數，判斷是否為第一張
  const collectionCountRef = useRef(0);

  const loadCollection = async () => {
    try {
      const response = await userAPI.getCollection();
      if (response.data.success) {
        setCollection(response.data.collection);
        setPendingShares(response.data.pendingShares || {});
        setShareTokens(response.data.shareTokens);
        setDrawChances(response.data.drawChances || 0);
      }
    } catch (error) {
      console.error('載入收藏失敗:', error);
    }
  };

  // 兌換待處理的 QR Code（登入後自動呼叫）
  const redeemPendingQR = async () => {
    const pendingQR = localStorage.getItem(PENDING_QR_KEY);
    if (!pendingQR) return;
    localStorage.removeItem(PENDING_QR_KEY);
    try {
      const response = await gachaAPI.pull(pendingQR);
      if (response.data.success) {
        setDrawChances(response.data.drawChances);
        alert(`🎉 ${response.data.message}`);
      }
    } catch (error) {
      const msg = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      alert(msg || '兌換失敗，請稍後再試');
    }
  };

  // 頁面載入時：偵測 URL 中的 ?qr= 並暫存
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const qrParam = urlParams.get('qr');
    if (qrParam) {
      localStorage.setItem(PENDING_QR_KEY, qrParam);
      window.history.replaceState({}, document.title, '/');
    }
  }, []);

  // 已登入使用者重新進入頁面時，自動載入收藏資料
  useEffect(() => {
    if (isAuthenticated) {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      // 若不是 LINE callback 流程，才在此載入（callback 流程由下方 useEffect 處理）
      if (!code) {
        loadCollection().then(redeemPendingQR);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在元件掛載時執行一次

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
            await redeemPendingQR();
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
          window.history.replaceState({}, document.title, '/');
        }
      })();
    }
  }, [isAuthenticated]);

  // QR Code 掃描成功處理 — 兌換為抽卡次數
  const handleQRScan = async (rawQR: string) => {
    // 防止重複掃描
    if (qrCodeProcessing) {
      console.log('掃描進行中，忽略此次掃描');
      return;
    }
    qrCodeProcessing = true;

    try {
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
        setDrawChances(response.data.drawChances);
        setShowScanner(false);
        alert(`🎉 ${response.data.message}`);
      }
    } catch (error: any) {
      console.error('兌換失敗:', error);
      alert(error.response?.data?.message || '兌換失敗，請稍後再試');
    } finally {
      qrCodeProcessing = false;
    }
  };

  // 使用抽卡次數抽卡
  const handleDraw = async () => {
    if (drawChances <= 0) {
      setShowNoChancesModal(true);
      return;
    }
    if (drawingInProgress) return;
    setDrawingInProgress(true);

    try {
      // 記錄抽卡前的收藏數
      collectionCountRef.current = Object.keys(collection).length;

      const response = await gachaAPI.draw();

      if (response.data.success) {
        setGachaResult({
          cardId: response.data.card.id,
          isNew: response.data.isNew,
        });
        setCollection(response.data.collection);
        setDrawChances(response.data.drawChances);
      }
    } catch (error: any) {
      console.error('抽卡失敗:', error);
      if (error.response?.data?.drawChances === 0) {
        setDrawChances(0);
        setShowNoChancesModal(true);
      } else {
        alert(error.response?.data?.message || '抽卡失敗，請稍後再試');
      }
      setDrawingInProgress(false);
    }
  };

  // 動畫結束後：關閉 scanner 返回主頁，若是第一張顯示寶箱提示
  const handleGachaComplete = () => {
    const wasFirstCard = collectionCountRef.current === 0;
    if (gachaResult) setLastCardId(gachaResult.cardId);
    setGachaResult(null);
    setShowScanner(false); // 返回主掃描頁
    setDrawingInProgress(false);
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
            <h1>☕咖啡地圖收集遊戲☕</h1>
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

                {/* 抽卡按鈕（含次數） */}
                <button
                  className={`draw-button${drawChances > 0 ? ' active' : ' disabled'}`}
                  onClick={handleDraw}
                  disabled={drawingInProgress}
                >
                  <span className='draw-button-label'>
                    {drawingInProgress ? '⏳ 抽卡中...' : '🎴 抽卡'}
                  </span>
                  <span className='draw-button-count'>× {drawChances} 次</span>
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

      {/* 抽卡次數不足彈窗 */}
      {showNoChancesModal && (
        <div
          className='modal-overlay'
          onClick={() => setShowNoChancesModal(false)}
        >
          <div
            className='modal-content no-chances-modal'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='modal-emoji'>☕</div>
            <h2>抽卡次數不足</h2>
            <p>去咖啡社買杯咖啡，增加你的抽獎次數哦！</p>
            <button
              className='modal-close-btn'
              onClick={() => setShowNoChancesModal(false)}
            >
              我知道了
            </button>
          </div>
        </div>
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
