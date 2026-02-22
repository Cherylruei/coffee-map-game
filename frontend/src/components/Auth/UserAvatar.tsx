import { motion } from 'framer-motion';
import { useAuthStore } from '../../hooks/useAuth';

export function UserAvatar() {
    const { user, logout } = useAuthStore();

    if (!user) return null;

    return (
        <div className="user-avatar-container" style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'rgba(255, 255, 255, 0.95)',
            padding: '8px 16px',
            borderRadius: '50px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}>
            <motion.img
                src={user.pictureUrl}
                alt={user.displayName}
                style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                }}
                whileHover={{ scale: 1.1 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>
                    {user.displayName}
                </span>
                <button
                    onClick={logout}
                    style={{
                        fontSize: '12px',
                        color: '#888',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        textAlign: 'left',
                    }}
                >
                    登出
                </button>
            </div>
        </div>
    );
}
