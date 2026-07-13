import { useState } from 'react';
import { userAPI } from '../../utils/api';

interface EmployeeIdModalProps {
    // 登記成功後回傳已登記的員編
    onRegistered: (customerEmployeeId: string) => void;
}

// 強制必填、不可關閉的員工編號登記彈窗
// 會員首次登入或尚未登記員編時顯示
export function EmployeeIdModal({ onRegistered }: EmployeeIdModalProps) {
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        const trimmed = value.trim();
        if (!trimmed) {
            setError('請填寫員工編號');
            return;
        }
        if (!/^[A-Za-z0-9]+$/.test(trimmed)) {
            setError('員工編號僅能包含英文字母與數字');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const res = await userAPI.registerCustomerEmployeeId(trimmed);
            if (res.data.success) {
                onRegistered(res.data.customerEmployeeId);
            } else {
                setError(res.data.message || '登記失敗，請稍後再試');
            }
        } catch (err) {
            const data = (
                err as {
                    response?: {
                        data?: { message?: string; customerEmployeeId?: string };
                    };
                }
            ).response?.data;
            // 該帳號其實已登記過（例如本機快取未同步），直接同步狀態關閉彈窗，
            // 避免客人卡在無法通過的錯誤畫面出不去
            if (data?.customerEmployeeId) {
                onRegistered(data.customerEmployeeId);
                return;
            }
            setError(data?.message || '登記失敗，請稍後再試');
        } finally {
            setLoading(false);
        }
    };

    return (
        // 遮罩不可點擊關閉（強制登記）
        <div className="modal-overlay" style={{ zIndex: 10002 }}>
            <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: '360px' }}
            >
                <div className="modal-emoji">🪪</div>
                <h2>登記員工編號</h2>
                <p>請填寫您的員工編號以完成登記，登記後即可使用咖啡地圖。</p>

                <input
                    type="text"
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value);
                        if (error) setError(null);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !loading) handleSubmit();
                    }}
                    placeholder="例如：005808 或 A1234"
                    autoFocus
                    disabled={loading}
                    style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '12px 14px',
                        margin: '16px 0 8px',
                        fontSize: '16px',
                        border: `1px solid ${error ? '#e25563' : '#ddd'}`,
                        borderRadius: '10px',
                        outline: 'none',
                    }}
                />

                {error && (
                    <p style={{ color: '#e25563', fontSize: '13px', margin: '0 0 8px' }}>
                        {error}
                    </p>
                )}

                <button
                    className="modal-close-btn"
                    onClick={handleSubmit}
                    disabled={loading}
                >
                    {loading ? '登記中...' : '確認登記'}
                </button>

                <p style={{ color: '#999', fontSize: '12px', marginTop: '10px' }}>
                    ⚠️ 請確認填寫正確；登記後可再修正，每次修改後需間隔 30 天
                </p>
            </div>
        </div>
    );
}
