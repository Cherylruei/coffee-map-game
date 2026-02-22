import { motion } from 'framer-motion';
import { CARDS, RARITY_COLORS } from '../../utils/cards';

interface CardItemProps {
    cardId: number;
    count?: number;
    size?: 'small' | 'medium' | 'large';
    showCount?: boolean;
}

export function CardItem({ cardId, count = 0, size = 'medium', showCount = true }: CardItemProps) {
    const card = CARDS[cardId];
    if (!card) return null;

    const sizeStyles = {
        small: { width: '120px', height: '170px' },
        medium: { width: '180px', height: '250px' },
        large: { width: '240px', height: '340px' },
    };

    const rarityStyle = RARITY_COLORS[card.rarity];

    return (
        <motion.div
            className="card-item"
            whileHover={{ scale: 1.05, y: -5 }}
            style={{
                ...sizeStyles[size],
                background: rarityStyle.bg,
                border: `3px solid ${rarityStyle.border}`,
                borderRadius: '16px',
                boxShadow: `${rarityStyle.glow}, 0 8px 20px rgba(0,0,0,0.2)`,
                position: 'relative',
                overflow: 'hidden',
                cursor: 'pointer',
                opacity: count === 0 ? 0.3 : 1,
                filter: count === 0 ? 'grayscale(100%)' : 'none',
            }}
        >
            {/* 稀有度標籤 */}
            <div style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: rarityStyle.border,
                color: 'white',
                padding: '4px 12px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 'bold',
                zIndex: 10,
            }}>
                {card.rarity}
            </div>

            {/* 卡片圖片 */}
            <div style={{
                width: '100%',
                height: '60%',
                background: '#f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '48px',
            }}>
                ☕
            </div>

            {/* 卡片資訊 */}
            <div style={{
                padding: '12px',
                background: 'rgba(255,255,255,0.95)',
                height: '40%',
            }}>
                <h3 style={{
                    margin: '0 0 4px 0',
                    fontSize: size === 'small' ? '14px' : '16px',
                    color: rarityStyle.text,
                }}>
                    {card.name}
                </h3>
                <p style={{
                    margin: 0,
                    fontSize: size === 'small' ? '11px' : '12px',
                    color: '#666',
                }}>
                    {card.origin}
                </p>

                {/* 數量顯示 */}
                {showCount && count > 0 && (
                    <div style={{
                        position: 'absolute',
                        bottom: '10px',
                        right: '10px',
                        background: 'rgba(0,0,0,0.8)',
                        color: 'white',
                        borderRadius: '50%',
                        width: '28px',
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 'bold',
                    }}>
                        ×{count}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
