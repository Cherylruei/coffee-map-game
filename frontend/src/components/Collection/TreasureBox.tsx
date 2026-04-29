import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CARDS, RARITY_COLORS } from '../../utils/cards';
import { useCollectionStore } from '../../hooks/useCollection';
import { api } from '../../utils/api';

interface TreasureBoxProps {
  isOpen: boolean;
  onClose: () => void;
  lastCardId?: number | null;
}

interface RewardCodeState {
  code: string;
  expiresAt?: string;
  rewardType: string;
  status: string;
}

// Equirectangular projection: x=(lon+180)/360*100, y=(80-lat)/160*100
const MAP_PINS: Record<number, { x: number; y: number; region: string }> = {
  1: { x: 27.9, y: 44.7, region: '巴拿馬' },
  2: { x: 28.5, y: 38.7, region: '牙買加' },
  3: { x: 60.6, y: 46.2, region: '衣索比亞' },
  4: { x: 6.7, y: 37.5, region: '夏威夷' },
  5: { x: 60.5, y: 50.3, region: '肯亞' },
  6: { x: 29.4, y: 47.1, region: '哥倫比亞' },
  7: { x: 24.9, y: 40.9, region: '瓜地馬拉' },
  8: { x: 77.4, y: 48.4, region: '印尼' },
  9: { x: 26.7, y: 44.0, region: '哥斯大黎加' },
  10: { x: 35.6, y: 58.9, region: '巴西' },
  11: { x: 80.1, y: 41.2, region: '越南' },
  12: { x: 59.7, y: 53.9, region: '坦尚尼亞' },
};

const MAP_RATIO = 49.41; // paddingBottom % = 506/1024*100
const MIN_SCALE = 1;
const MAX_SCALE = 5;

function getTouchDist(touches: React.TouchList) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getTouchMid(touches: React.TouchList) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
}

function clamp(val: number, min: number, max: number) {
  return Math.min(max, Math.max(min, val));
}

function clampTransform(
  scale: number,
  tx: number,
  ty: number,
  vpW: number,
  vpH: number,
) {
  const mapW = vpW * scale;
  const mapH = vpW * (MAP_RATIO / 100) * scale;
  const minTx = Math.min(0, vpW - mapW);
  const minTy = Math.min(0, vpH - mapH);
  return {
    scale,
    tx: clamp(tx, minTx, 0),
    ty: clamp(ty, minTy, 0),
  };
}

// Mini card pin
function CardPin({
  card,
  collected,
  count,
  rStyle,
  onClick,
  delay,
}: {
  card: (typeof CARDS)[number];
  collected: boolean;
  count: number;
  rStyle: (typeof RARITY_COLORS)[keyof typeof RARITY_COLORS];
  onClick: () => void;
  delay: number;
}) {
  const pos = MAP_PINS[card.id];
  if (!pos) return null;

  return (
    <motion.button
      key={card.id}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 220, damping: 18 }}
      whileHover={{ scale: 1.35, zIndex: 20 }}
      onClick={onClick}
      style={{
        position: 'absolute',
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transform: 'translate(-50%, -50%)',
        width: '36px',
        height: '50px',
        borderRadius: '6px',
        border: `2px solid ${collected ? rStyle.border : '#555'}`,
        boxShadow: collected
          ? `${rStyle.glow}, 0 4px 12px rgba(0,0,0,0.6)`
          : '0 2px 6px rgba(0,0,0,0.5)',
        cursor: 'pointer',
        padding: 0,
        overflow: 'hidden',
        background: collected ? rStyle.bg : 'rgba(20,20,35,0.9)',
        zIndex: collected ? 3 : 1,
        opacity: collected ? 1 : 0.55,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'none', // let parent handle pan/zoom
      }}
    >
      {collected ? (
        <img
          src={card.image}
          alt={card.name}
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            // objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: 'linear-gradient(160deg, #1a2340 0%, #0d1a30 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            color: '#4a5a80',
            fontWeight: 'bold',
          }}
        >
          ?
        </div>
      )}

      {count > 1 && (
        <span
          style={{
            position: 'absolute',
            top: '-5px',
            right: '-5px',
            background: '#ff4444',
            color: 'white',
            borderRadius: '50%',
            width: '16px',
            height: '16px',
            fontSize: '9px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1.5px solid #0a1628',
          }}
        >
          {count}
        </span>
      )}

      <span
        style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: '3px',
          fontSize: '8px',
          color: collected ? '#fff' : '#777',
          whiteSpace: 'nowrap',
          background: 'rgba(0,0,0,0.65)',
          padding: '2px 4px',
          borderRadius: '3px',
          textShadow: '0 1px 2px rgba(0,0,0,0.9)',
          fontWeight: 600,
          pointerEvents: 'none',
        }}
      >
        {pos.region}
      </span>
    </motion.button>
  );
}

export function TreasureBox({ isOpen, onClose, lastCardId }: TreasureBoxProps) {
  const { collection } = useCollectionStore();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isRedeemModalOpen, setIsRedeemModalOpen] = useState(false);
  const [rewardCode, setRewardCode] = useState<RewardCodeState | null>(null);
  const [rewardCodeMessage, setRewardCodeMessage] = useState('');
  const [rewardCodeError, setRewardCodeError] = useState('');
  const [isRewardCodeLoading, setIsRewardCodeLoading] = useState(false);
  const [isAlreadyRedeemed, setIsAlreadyRedeemed] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState('');

  // ── Pinch-zoom state ──
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });

  // 開啟時設定初始縮放
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    let nextTransform = { scale: 1, tx: 0, ty: 0 };
    const vpW = window.innerWidth;
    const headerH = 72;   // header 實際高度
    const bottomPad = 50; // 距底部 sidebar 的安全距離
    const vpH = window.innerHeight - headerH - bottomPad;

    if (lastCardId && MAP_PINS[lastCardId]) {
      // 對焦到剛收集的卡片
      const pin = MAP_PINS[lastCardId];
      const scale = 2.5;
      const pinPx = (pin.x / 100) * vpW * scale;
      const pinPy = (pin.y / 100) * vpW * (MAP_RATIO / 100) * scale;
      nextTransform = clampTransform(
        scale,
        vpW / 2 - pinPx,
        vpH / 2 - pinPy,
        vpW,
        vpH,
      );
    } else {
      // 預設：縮放至地圖填滿視窗高度（4/5 以上）
      const mapHeightAt1 = vpW * (MAP_RATIO / 100);
      const fitScale = clamp(vpH / mapHeightAt1, MIN_SCALE, MAX_SCALE);
      const mapW = vpW * fitScale;
      nextTransform = clampTransform(
        fitScale,
        Math.min(0, (vpW - mapW) / 2),
        0,
        vpW,
        vpH,
      );
    }

    const frame = window.requestAnimationFrame(() => {
      setTransform(nextTransform);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isOpen, lastCardId]);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Gesture tracking refs (never cause re-renders)
  const gesture = useRef({
    isPinching: false,
    startDist: 0,
    startScale: 1,
    startTx: 0,
    startTy: 0,
    startMidX: 0,
    startMidY: 0,
    isSingleTouch: false,
    lastX: 0,
    lastY: 0,
    // tap detection
    touchStartX: 0,
    touchStartY: 0,
    hasMoved: false,
  });

  const updateTransform = useCallback((next: typeof transform) => {
    setTransform(next);
  }, []);

  const resetZoom = () => setTransform({ scale: 1, tx: 0, ty: 0 });

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const g = gesture.current;
      const vp = viewportRef.current;
      if (!vp) return;

      if (e.touches.length === 2) {
        g.isPinching = true;
        g.isSingleTouch = false;
        g.hasMoved = false;
        g.startDist = getTouchDist(e.touches);
        g.startScale = transform.scale;
        g.startTx = transform.tx;
        g.startTy = transform.ty;
        const mid = getTouchMid(e.touches);
        const rect = vp.getBoundingClientRect();
        g.startMidX = mid.x - rect.left;
        g.startMidY = mid.y - rect.top;
      } else if (e.touches.length === 1) {
        g.isPinching = false;
        g.isSingleTouch = true;
        g.hasMoved = false;
        g.lastX = e.touches[0].clientX;
        g.lastY = e.touches[0].clientY;
        g.touchStartX = e.touches[0].clientX;
        g.touchStartY = e.touches[0].clientY;
      }
    },
    [transform],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      const g = gesture.current;
      const vp = viewportRef.current;
      if (!vp) return;
      const { width: vpW, height: vpH } = vp.getBoundingClientRect();

      if (g.isPinching && e.touches.length === 2) {
        g.hasMoved = true;
        const dist = getTouchDist(e.touches);
        const ratio = dist / g.startDist;
        const newScale = clamp(g.startScale * ratio, MIN_SCALE, MAX_SCALE);
        // Keep pinch midpoint visually fixed
        const newTx =
          g.startMidX - (g.startMidX - g.startTx) * (newScale / g.startScale);
        const newTy =
          g.startMidY - (g.startMidY - g.startTy) * (newScale / g.startScale);
        updateTransform(clampTransform(newScale, newTx, newTy, vpW, vpH));
      } else if (g.isSingleTouch && e.touches.length === 1) {
        const dx = e.touches[0].clientX - g.lastX;
        const dy = e.touches[0].clientY - g.lastY;
        g.lastX = e.touches[0].clientX;
        g.lastY = e.touches[0].clientY;

        const totalDx = e.touches[0].clientX - g.touchStartX;
        const totalDy = e.touches[0].clientY - g.touchStartY;
        if (Math.abs(totalDx) > 4 || Math.abs(totalDy) > 4) g.hasMoved = true;

        // Only pan when zoomed in
        if (transform.scale > 1) {
          setTransform((prev) =>
            clampTransform(prev.scale, prev.tx + dx, prev.ty + dy, vpW, vpH),
          );
        }
      }
    },
    [transform, updateTransform],
  );

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const g = gesture.current;
    if (e.touches.length < 2) g.isPinching = false;
    if (e.touches.length === 0) g.isSingleTouch = false;
    if (e.touches.length === 1) {
      g.lastX = e.touches[0].clientX;
      g.lastY = e.touches[0].clientY;
    }
  }, []);

  const totalCards = Object.keys(CARDS).length;
  const collectedCount = Object.keys(collection).filter(
    (k) => (collection[Number(k)] || 0) > 0,
  ).length;
  const isCollectionComplete = collectedCount === totalCards;

  const selectedCard = selectedId ? CARDS[selectedId] : null;
  const selectedRarity = selectedCard
    ? RARITY_COLORS[selectedCard.rarity]
    : null;
  const selectedCount = selectedId ? collection[selectedId] || 0 : 0;

  const loadRewardCode = useCallback(async () => {
    if (!isCollectionComplete) return;

    setIsRewardCodeLoading(true);
    setRewardCodeError('');
    setCopyFeedback('');

    try {
      const response = await api.post('/user/redeem-code');
      const data = response.data as {
        success: boolean;
        message?: string;
        alreadyIssued?: boolean;
        isAlreadyRedeemed?: boolean;
        rewardCode?: RewardCodeState;
      };

      if (!data.success) {
        setRewardCode(null);
        setRewardCodeMessage('');
        setIsAlreadyRedeemed(false);
        setRewardCodeError(data.message || '目前無法建立兌換碼');
        return;
      }

      // 已經兌換完成
      if (data.isAlreadyRedeemed) {
        setRewardCode(null);
        setRewardCodeMessage('');
        setIsAlreadyRedeemed(true);
        setRewardCodeError('');
        return;
      }

      // 有兌換碼
      if (data.rewardCode) {
        setRewardCode(data.rewardCode);
        setRewardCodeMessage(
          data.alreadyIssued
            ? '已為你保留尚未使用的兌換碼，核銷前不會重複發碼。'
            : '兌換碼已建立，請於商家後台輸入後核銷。',
        );
        setIsAlreadyRedeemed(false);
        setRewardCodeError('');
        return;
      }

      // 其他情況
      setRewardCode(null);
      setRewardCodeMessage('');
      setIsAlreadyRedeemed(false);
      setRewardCodeError(data.message || '目前無法建立兌換碼');
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message || '兌換碼建立失敗，請稍後再試';
      setRewardCode(null);
      setRewardCodeMessage('');
      setIsAlreadyRedeemed(false);
      setRewardCodeError(message);
    } finally {
      setIsRewardCodeLoading(false);
    }
  }, [isCollectionComplete]);

  // 當集滿卡片時，檢查是否已兌換過（用於咖啡產地圖鑑區域的狀態顯示）
  useEffect(() => {
    if (!isCollectionComplete || isAlreadyRedeemed || isRewardCodeLoading) {
      return;
    }

    // 主動檢查一次是否已兌換
    const checkRedemptionStatus = async () => {
      try {
        const response = await api.post('/user/redeem-code');
        const data = response.data as {
          success: boolean;
          isAlreadyRedeemed?: boolean;
        };

        if (data.isAlreadyRedeemed) {
          setIsAlreadyRedeemed(true);
        }
      } catch {
        // 錯誤時不做任何處理，讓用戶點按鈕時再檢查
      }
    };

    checkRedemptionStatus();
  }, [isCollectionComplete]);

  useEffect(() => {
    if (!isRedeemModalOpen || !isCollectionComplete || rewardCode || isRewardCodeLoading || isAlreadyRedeemed) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      loadRewardCode();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    isCollectionComplete,
    isRedeemModalOpen,
    isRewardCodeLoading,
    isAlreadyRedeemed,
    loadRewardCode,
    rewardCode,
  ]);

  function closeRedeemModal() {
    setIsRedeemModalOpen(false);
    setRewardCode(null);
    setRewardCodeMessage('');
    setRewardCodeError('');
    setIsAlreadyRedeemed(false);
    setCopyFeedback('');
  }

  async function copyRewardCode() {
    if (!rewardCode?.code) return;

    try {
      await navigator.clipboard.writeText(rewardCode.code);
      setCopyFeedback('已複製兌換碼');
    } catch {
      setCopyFeedback('複製失敗，請手動複製');
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key='treasure-bg'
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            display: 'flex',
            flexDirection: 'column',
            background: '#0a1628',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-evenly',
              padding: '16px 20px',
              background:
                'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%)',
              flexShrink: 0,
              zIndex: 2,
              position: 'relative',
            }}
          >
            <div>
              <h2
                style={{
                  color: '#FFD700',
                  fontSize: '18px',
                  margin: 0,
                  textShadow: '0 0 12px rgba(255,215,0,0.5)',
                }}
              >
                🗺️ 咖啡產地圖鑑
              </h2>
              {isAlreadyRedeemed ? (
                <div style={{ color: '#4caf50', fontSize: '15px', fontWeight: 700, marginTop: '6px' }}>
                  恭喜破關!飲品已兌換完成
                </div>
              ) : isCollectionComplete ? (
                <motion.button
                  onClick={() => setIsRedeemModalOpen(true)}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    width: '180px',
                    marginTop: '6px',
                    padding: '7px 11px',
                    borderRadius: '10px',
                    border: '1px solid #ffd66b',
                    background:
                      'linear-gradient(180deg, rgba(255,220,120,0.24) 0%, rgba(255,185,70,0.16) 100%)',
                    color: '#fff3c7',
                    fontSize: '14px',
                    fontWeight: 700,
                    textAlign: 'left',
                    cursor: 'pointer',
                    lineHeight: 1.35,
                    boxShadow: '0 0 12px rgba(255,215,0,0.22)',
                  }}
                >
                  已收集 {collectedCount} / {totalCards} 張<br/>恭喜已集滿! <br/>可點此兌換任一杯飲品
                </motion.button>
              ) : (
                <p style={{ color: '#aaa', fontSize: '16px', margin: '3px 0 0' }}>
                  已收集 {collectedCount} / {totalCards} 張・雙指縮放精確點擊
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {transform.scale > 1.05 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={resetZoom}
                  style={{
                    background: 'rgba(255,255,255,0.15)',
                    border: '1px solid rgba(255,255,255,0.25)',
                    color: 'white',
                    borderRadius: '8px',
                    padding: '5px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  縮小回全圖
                </motion.button>
              )}
              <motion.button
                onClick={onClose}
                whileTap={{ scale: 0.9 }}
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: 'white',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  fontSize: '18px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                ×
              </motion.button>
            </div>
          </div>

          {/* ── Map Viewport (pinch-zoom container) ── */}
          <div
            ref={viewportRef}
            style={{
              flex: 1,
              overflow: 'hidden',
              position: 'relative',
              background: '#060e1c',
              touchAction: 'none',
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Zoomable layer */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
                transformOrigin: '0 0',
                willChange: 'transform',
              }}
            >
              {/* Map wrapper — exact 1024:506 ratio */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  paddingBottom: `${MAP_RATIO}%`,
                }}
              >
                <img
                  src='/world-map.jpg'
                  alt='world map'
                  draggable={false}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'fill',
                    display: 'block',
                    userSelect: 'none',
                  }}
                />

                {/* Card Pins */}
                {Object.values(CARDS).map((card, i) => {
                  const count = collection[card.id] || 0;
                  const collected = count > 0;
                  const rStyle = RARITY_COLORS[card.rarity];
                  return (
                    <CardPin
                      key={card.id}
                      card={card}
                      collected={collected}
                      count={count}
                      rStyle={rStyle}
                      onClick={() => setSelectedId(card.id)}
                      delay={i * 0.04}
                    />
                  );
                })}
              </div>
            </div>

            {/* Scale indicator */}
            {transform.scale > 1.05 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(0,0,0,0.5)',
                  color: 'rgba(255,255,255,0.7)',
                  borderRadius: '12px',
                  padding: '4px 12px',
                  fontSize: '11px',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {transform.scale.toFixed(1)}×・雙指縮小回全圖
              </motion.div>
            )}
          </div>
        </motion.div>
      )}

      {/* Card Detail Modal */}
      <AnimatePresence>
        {selectedId && selectedCard && selectedRarity && (
          <motion.div
            key='card-detail'
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              background: 'rgba(0,0,0,0.78)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedId(null)}
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.6, opacity: 0, y: 30 }}
              transition={{ type: 'spring', stiffness: 220, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(280px, 82vw)',
                borderRadius: '16px',
                border: `1.5px solid ${selectedRarity.border}`,
                boxShadow: `${selectedRarity.glow}, 0 20px 60px rgba(0,0,0,0.8)`,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {/* Card image fills entire card */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  paddingBottom: '140%',
                  filter: selectedCount === 0 ? 'grayscale(100%)' : 'none',
                  opacity: selectedCount === 0 ? 0.5 : 1,
                }}
              >
                <img
                  src={selectedCard.image}
                  alt={selectedCard.name}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    display: 'block',
                  }}
                />
                {selectedCount === 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '72px',
                      color: 'rgba(255,255,255,0.3)',
                      fontWeight: 'bold',
                    }}
                  >
                    ?
                  </div>
                )}
              </div>

              {/* Top overlay: rarity + count */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  padding: '10px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background:
                    'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)',
                }}
              >
                <span
                  style={{
                    background: selectedRarity.border,
                    color: 'white',
                    padding: '3px 12px',
                    borderRadius: '30px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    letterSpacing: '1px',
                  }}
                >
                  {selectedCard.rarity}
                </span>
                <span
                  style={{
                    color: 'rgba(255,255,255,0.9)',
                    fontSize: '20px',
                    fontWeight: 600,
                    textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                  }}
                >
                  {selectedCount > 0
                    ? selectedCount > 1
                      ? `×${selectedCount} 已收集`
                      : '✓ 已收集'
                    : '待收集'}
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Redeem Code Modal */}
      <AnimatePresence>
        {isRedeemModalOpen && (
          <motion.div
            key='redeem-code'
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10001,
              background: 'rgba(0,0,0,0.78)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => closeRedeemModal()}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 220, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 'min(520px, 92vw)',
                borderRadius: '16px',
                border: '1px solid rgba(255,215,0,0.35)',
                background: 'linear-gradient(180deg, #132033 0%, #0b1424 100%)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.65)',
                color: '#ecf0f7',
                padding: '18px 18px 16px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#ffd66b' }}>集滿兌換碼</h3>
                <button
                  onClick={() => closeRedeemModal()}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#d6dfef',
                    fontSize: '20px',
                    lineHeight: 1,
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>

              <p style={{ margin: '10px 0', fontSize: '14px', color: '#c2cbe0' }}>
                集滿 12 張後，系統會為你保留一組一次性兌換碼。到店後出示給店員，由商家後台輸入核銷並選擇本次免費飲品。
              </p>

              <div
                style={{
                  border: '1px solid rgba(120,160,240,0.35)',
                  borderRadius: '12px',
                  padding: '14px 12px',
                  marginBottom: '10px',
                  background: 'rgba(70,120,220,0.1)',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '8px' }}>店內核銷方式</div>
                <div style={{ fontSize: '13px', color: '#d6deee', lineHeight: 1.6 }}>
                  1. 出示下方兌換碼給店員。<br />
                  2. 店員在商家後台輸入兌換碼。<br />
                  3. 店員選擇本次免費飲品並完成點單，系統會自動列入兌換統計。
                </div>
              </div>

              <div
                style={{
                  border:
                    isAlreadyRedeemed || rewardCodeError
                      ? isAlreadyRedeemed
                        ? '1px solid rgba(76, 175, 80, 0.45)'
                        : '1px solid rgba(230, 80, 80, 0.45)'
                      : '1px solid rgba(255,255,255,0.18)',
                  borderRadius: '12px',
                  padding: '14px 12px',
                  background:
                    isAlreadyRedeemed
                      ? 'rgba(76, 175, 80, 0.1)'
                      : rewardCodeError
                        ? 'rgba(230, 80, 80, 0.08)'
                        : 'rgba(255,255,255,0.04)',
                  marginBottom: '10px',
                }}
              >
                <div style={{ fontSize: '12px', color: '#9fb0c8', marginBottom: '8px' }}>
                  一次性兌換碼
                </div>
                {isRewardCodeLoading ? (
                  <div style={{ fontSize: '15px', color: '#fff3c7' }}>正在建立兌換碼…</div>
                ) : isAlreadyRedeemed ? (
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 700,
                      color: '#4caf50',
                      lineHeight: 1.5,
                    }}
                  >
                    恭喜破關! 飲品已兌換完成
                  </div>
                ) : rewardCode ? (
                  <>
                    <div
                      style={{
                        fontSize: '28px',
                        letterSpacing: '1.5px',
                        fontWeight: 800,
                        color: '#fff3c7',
                        marginBottom: '8px',
                        wordBreak: 'break-all',
                      }}
                    >
                      {rewardCode.code}
                    </div>
                    <div style={{ fontSize: '13px', color: '#d6deee', lineHeight: 1.5 }}>
                      {rewardCodeMessage}
                      {rewardCode.expiresAt
                        ? ` 效期至 ${new Date(rewardCode.expiresAt).toLocaleDateString('zh-TW')}`
                        : ''}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: '14px', color: '#ffb4b4', lineHeight: 1.5 }}>
                    {rewardCodeError || '目前無可用兌換碼'}
                  </div>
                )}
              </div>

              <div
                style={{
                  fontSize: '12px',
                  color: '#9fb0c8',
                  lineHeight: 1.6,
                  marginBottom: '10px',
                }}
              >
                提醒：同一帳號在未核銷前不會重新發碼；已核銷完成後，也不會再次取得新的集滿兌換碼。
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={copyRewardCode}
                  disabled={!rewardCode || isRewardCodeLoading}
                  style={{
                    background: 'rgba(255,215,0,0.16)',
                    border: '1px solid rgba(255,215,0,0.35)',
                    color: '#fff3c7',
                    borderRadius: '10px',
                    padding: '9px 12px',
                    cursor: rewardCode ? 'pointer' : 'not-allowed',
                    fontWeight: 700,
                  }}
                >
                  複製兌換碼
                </button>
                <button
                  onClick={loadRewardCode}
                  disabled={isRewardCodeLoading}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.25)',
                    color: '#d6dfef',
                    borderRadius: '10px',
                    padding: '9px 12px',
                    cursor: isRewardCodeLoading ? 'not-allowed' : 'pointer',
                    fontWeight: 700,
                  }}
                >
                  重新取得
                </button>
                {copyFeedback && (
                  <div style={{ display: 'flex', alignItems: 'center', fontSize: '13px', color: '#c2cbe0' }}>
                    {copyFeedback}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
}
