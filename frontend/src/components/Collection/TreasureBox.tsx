import { motion, AnimatePresence } from 'framer-motion';
import { CardItem } from '../Card/CardItem';
import { useCollectionStore } from '../../hooks/useCollection';
import { CARDS } from '../../utils/cards';

interface TreasureBoxProps {
    isOpen: boolean;
    onClose: () => void;
}

export function TreasureBox({ isOpen, onClose }: TreasureBoxProps) {
    const { collection } = useCollectionStore();

    const totalCards = Object.keys(CARDS).length;
    const collectedCards = Object.keys(collection).length;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="collection-modal"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100vw',
                        height: '100vh',
                        background: 'rgba(0,0,0,0.85)',
                        zIndex: 9998,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px',
                    }}
                    onClick={onClose}
                >
                    <motion.div
                        className="collection-content"
                        initial={{ scale: 0.8, y: 50 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.8, y: 50 }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                            borderRadius: '24px',
                            padding: '40px',
                            maxWidth: '1000px',
                            width: '100%',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            border: '3px solid #FFD700',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                        }}
                    >
                        {/* 標題 */}
                        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                            <h2 style={{
                                color: '#FFD700',
                                fontSize: '32px',
                                margin: '0 0 10px 0',
                                textShadow: '0 0 10px rgba(255,215,0,0.5)',
                            }}>
                                ☕ 咖啡圖鑑 ☕
                            </h2>
                            <p style={{ color: '#ccc', fontSize: '16px', margin: 0 }}>
                                已收集 {collectedCards} / {totalCards} 張
                            </p>
                        </div>

                        {/* 卡片網格 */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                            gap: '20px',
                        }}>
                            {Object.values(CARDS).map((card, index) => (
                                <motion.div
                                    key={card.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                >
                                    <CardItem
                                        cardId={card.id}
                                        count={collection[card.id] || 0}
                                        size="medium"
                                        showCount={true}
                                    />
                                </motion.div>
                            ))}
                        </div>

                        {/* 關閉按鈕 */}
                        <button
                            onClick={onClose}
                            style={{
                                marginTop: '30px',
                                background: '#444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '12px',
                                padding: '12px 32px',
                                fontSize: '16px',
                                cursor: 'pointer',
                                display: 'block',
                                margin: '30px auto 0',
                            }}
                        >
                            關閉
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
