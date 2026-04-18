import { useEffect, useRef, useState } from 'react';
import { LoginButton } from './components/Auth/LoginButton';
import { UserAvatar } from './components/Auth/UserAvatar';
import { QRScanner } from './components/QRScanner/Scanner';
import { GachaAnimation } from './components/Card/GachaAnimation';
import { TreasureBox } from './components/Collection/TreasureBox';
import { ShareButton } from './components/Share/ShareButton';
import { FloatingSidebar } from './components/FloatingSidebar/FloatingSidebar';
import { MenuOverlay } from './components/MenuOverlay/MenuOverlay';
import { WalletPaymentModal } from './components/Wallet/WalletPaymentModal';
import { WalletBalance } from './components/Wallet/WalletBalance';
import { useAuthStore } from './hooks/useAuth';
import { useCollectionStore } from './hooks/useCollection';
import { useWalletStore } from './hooks/useWallet';
import {
  authAPI,
  userAPI,
  gachaAPI,
  shareAPI,
  walletAPI,
  qrcodeAPI,
} from './utils/api';
import type { QRCodeInfo } from './types';
import {
  trackLoginSuccess,
  trackQRScan,
  trackGachaDraw,
  trackPageView,
  trackSignUp,
  trackShareCardClaimed,
  trackWalletTopup,
} from './utils/analytics';
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
  // 錢包付款確認彈窗
  const [walletPaymentPending, setWalletPaymentPending] = useState<{
    code: string;
    amount: number;
  } | null>(null);
  const [walletPaymentLoading, setWalletPaymentLoading] = useState(false);
  // 記錄抽卡前的收藏數，判斷是否為第一張
  const collectionCountRef = useRef(0);

  const {
    balance: walletBalance,
    fetchBalance,
    setBalance: setWalletBalance,
  } = useWalletStore();

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
      const msg = (error as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      alert(msg || '兌換失敗，請稍後再試');
    }
  };

  // 頁面載入時：追蹤頁面瀏覽 & 偵測 URL 中的 ?qr= 並暫存
  useEffect(() => {
    trackPageView('/');
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
        fetchBalance();
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
            if (response.data.isNewUser) trackSignUp('LINE');
            trackLoginSuccess('LINE');
            await loadCollection();
            await redeemPendingQR();
            fetchBalance();
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
            trackShareCardClaimed(response.data.card.id, response.data.isNew);
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

  // 解析 rawQR → 代碼字串（支援完整 URL 或純代碼）
  function extractQRCode(rawQR: string): string {
    try {
      const url = new URL(rawQR);
      return url.searchParams.get('qr') || rawQR;
    } catch {
      return rawQR;
    }
  }

  // 執行抽卡 QR 兌換（含錢包扣款），供掃描與確認彈窗共用
  const redeemGachaQR = async (qrCode: string) => {
    const response = await gachaAPI.pull(qrCode);
    if (response.data.success) {
      trackQRScan('success');
      setDrawChances(response.data.drawChances);
      if (
        response.data.newWalletBalance !== null &&
        response.data.newWalletBalance !== undefined
      ) {
        setWalletBalance(response.data.newWalletBalance);
      }
      setShowScanner(false);
      alert(`🎉 ${response.data.message}`);
    }
  };

  // QR Code 掃描成功處理 — 依 QR 類型分流
  const handleQRScan = async (rawQR: string) => {
    if (qrCodeProcessing) return;
    qrCodeProcessing = true;

    const qrCode = extractQRCode(rawQR);
    let openedModal = false; // 本地旗標，避免 React state 非同步導致誤判

    try {
      // 1. 先查詢 QR 資訊（不標記已使用）
      const infoRes = await qrcodeAPI.getInfo(qrCode);
      const info = infoRes.data as QRCodeInfo & {
        success: boolean;
        message?: string;
      };

      if (!info?.success) {
        alert(info?.message || 'QR Code 無效或已過期');
        return;
      }

      // 2. 儲值 QR（TOPUP-）→ 自動入帳
      if (info.type === 'topup') {
        const topupRes = await walletAPI.topup(qrCode);
        if (topupRes.data?.success) {
          setWalletBalance(topupRes.data.newBalance);
          trackWalletTopup(topupRes.data.amount);
          setShowScanner(false);
          alert(`💰 ${topupRes.data.message}`);
        } else {
          alert(topupRes.data?.message || '儲值失敗');
        }
        return;
      }

      // 3. 點單 QR + 錢包付款 → 顯示確認彈窗
      if (info.type === 'gacha' && (info.walletAmount ?? 0) > 0) {
        await fetchBalance(); // 確保餘額最新
        setWalletPaymentPending({ code: qrCode, amount: info.walletAmount! });
        openedModal = true;
        return; // 等待用戶在彈窗確認，qrCodeProcessing 由 handleWalletConfirm/Cancel 解鎖
      }

      // 4. 一般點單 QR → 現有流程
      await redeemGachaQR(qrCode);
    } catch (error: any) {
      trackQRScan('error');
      const msg = error.response?.data?.message || '兌換失敗，請稍後再試';
      alert(msg);
    } finally {
      // 開啟彈窗時保持鎖定，其餘情況皆解鎖
      if (!openedModal) qrCodeProcessing = false;
    }
  };

  // 用戶在確認彈窗點「確認付款」
  const handleWalletConfirm = async () => {
    if (!walletPaymentPending) return;
    setWalletPaymentLoading(true);
    try {
      await redeemGachaQR(walletPaymentPending.code);
    } catch (error: any) {
      trackQRScan('error');
      alert(error.response?.data?.message || '付款失敗，請稍後再試');
    } finally {
      setWalletPaymentLoading(false);
      setWalletPaymentPending(null);
      qrCodeProcessing = false;
    }
  };

  // 用戶取消付款確認
  const handleWalletCancel = () => {
    setWalletPaymentPending(null);
    qrCodeProcessing = false;
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
        trackGachaDraw(response.data.card.id, response.data.isNew);
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
            <p>掃描 QR Code，收集世界咖啡產地卡片！</p>
            {!showScanner ? (
              <div className='action-buttons'>
                <button
                  onClick={() => setShowScanner(true)}
                  className='scan-button'
                >
                  掃描 QR Code
                </button>

                {/* 抽卡按鈕（含次數） */}
                <button
                  className={`draw-button${drawChances > 0 ? ' active' : ' disabled'}`}
                  onClick={handleDraw}
                  disabled={drawingInProgress}
                >
                  <span className='draw-button-label'>
                    {drawingInProgress ? '⏳ 抽卡中...' : ' 抽卡'}
                  </span>
                  <span className='draw-button-count'>× {drawChances} 次</span>
                </button>

                <button
                  className='menu-button'
                  onClick={() => setMenuOpen(true)}
                >
                  📋 查看菜單
                </button>

                {/* 咖啡儲值金 — 對齊按鈕列底部 */}
                <WalletBalance />
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

      {/* 錢包付款確認彈窗 */}
      {walletPaymentPending && (
        <WalletPaymentModal
          amount={walletPaymentPending.amount}
          currentBalance={walletBalance}
          onConfirm={handleWalletConfirm}
          onCancel={handleWalletCancel}
          loading={walletPaymentLoading}
        />
      )}
    </div>
  );
}

export default App;
