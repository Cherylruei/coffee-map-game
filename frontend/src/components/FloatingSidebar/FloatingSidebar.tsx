import { motion } from 'framer-motion';
import { IconContext } from 'react-icons';
import { GiOpenTreasureChest } from 'react-icons/gi';
import { FaRegShareSquare } from 'react-icons/fa';

interface FloatingSidebarProps {
    onTreasureClick: () => void;
    onShareClick: () => void;
    collectedCount: number;
    shareTokens: number;
}

export function FloatingSidebar({
    onTreasureClick,
    onShareClick,
    collectedCount,
    shareTokens,
}: FloatingSidebarProps) {
    return (
        <IconContext.Provider value={{ style: { verticalAlign: 'middle' } }}>
            <motion.div
                className="floating-sidebar"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3, type: 'spring' }}
                style={{
                    position: 'fixed',
                    right: '16px',
                    bottom: '24px',
                    width: '56px',
                    background: 'rgba(255, 255, 255, 0.95)',
                    borderRadius: '28px',
                    padding: '12px 0',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                    zIndex: 100,
                    backdropFilter: 'blur(10px)',
                }}
            >
                {/* Treasure Box */}
                <motion.button
                    onClick={onTreasureClick}
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.9 }}
                    aria-label="寶箱圖鑑"
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        width: '42px',
                        height: '42px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                        position: 'relative',
                        padding: 0,
                    }}
                >
                    <GiOpenTreasureChest size={28} color="#8B4513" />
                    {collectedCount > 0 && (
                        <span
                            style={{
                                position: 'absolute',
                                top: '-4px',
                                right: '-4px',
                                background: '#ff4444',
                                color: 'white',
                                borderRadius: '50%',
                                width: '18px',
                                height: '18px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                fontWeight: 'bold',
                                border: '1.5px solid white',
                                lineHeight: 1,
                            }}
                        >
                            {collectedCount}
                        </span>
                    )}
                </motion.button>

                {/* Divider */}
                <div
                    style={{
                        width: '28px',
                        height: '1px',
                        background: 'rgba(0,0,0,0.1)',
                    }}
                />

                {/* Share */}
                <motion.button
                    onClick={onShareClick}
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.9 }}
                    aria-label="分享卡片"
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        width: '42px',
                        height: '42px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                        position: 'relative',
                        padding: 0,
                    }}
                >
                    <FaRegShareSquare size={24} color="#667eea" />
                    {shareTokens > 0 && (
                        <span
                            style={{
                                position: 'absolute',
                                top: '-4px',
                                right: '-4px',
                                background: '#667eea',
                                color: 'white',
                                borderRadius: '50%',
                                width: '18px',
                                height: '18px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                fontWeight: 'bold',
                                border: '1.5px solid white',
                                lineHeight: 1,
                            }}
                        >
                            {shareTokens}
                        </span>
                    )}
                </motion.button>
            </motion.div>
        </IconContext.Provider>
    );
}
