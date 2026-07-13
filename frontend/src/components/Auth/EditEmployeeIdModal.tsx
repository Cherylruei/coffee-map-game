import { useState } from 'react';
import { userAPI } from '../../utils/api';

interface EditEmployeeIdModalProps {
    currentEmployeeId: string;
    // 下次可修改的時間（ISO 字串）；null 表示現在就能修改
    editableAt: string | null;
    onClose: () => void;
    // 修改成功後回傳新的員編
    onChanged: (customerEmployeeId: string) => void;
}

function getDaysLeft(editableAt: string | null): number {
    if (!editableAt) return 0;
    const diffMs = new Date(editableAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

// 可關閉版本：讓已登記過員編的會員自行修改（登記/修改後需間隔 30 天）
export function EditEmployeeIdModal({
    currentEmployeeId,
    editableAt,
    onClose,
    onChanged,
}: EditEmployeeIdModalProps) {
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const daysLeft = getDaysLeft(editableAt);
    const isCoolingDown = daysLeft > 0;

    const handleSubmit = async () => {
        if (isCoolingDown) return;

        const trimmed = value.trim();
        if (!trimmed) {
            setError('請填寫新的員工編號');
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
                onChanged(res.data.customerEmployeeId);
                onClose();
            } else {
                setError(res.data.message || '修改失敗，請稍後再試');
            }
        } catch (err) {
            const msg = (
                err as { response?: { data?: { message?: string } } }
            ).response?.data?.message;
            setError(msg || '修改失敗，請稍後再試');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" style={{ zIndex: 10002 }} onClick={onClose}>
            <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: '360px' }}
            >
                <div className="modal-emoji">🪪</div>
                <h2>修改員工編號</h2>
                <p>
                    目前員編：<strong>{currentEmployeeId}</strong>
                    <br />
                    修改後需間隔 30 天才能再次修改，請確認填寫正確。
                </p>

                {isCoolingDown ? (
                    <p style={{ color: '#e25563', fontSize: '14px', margin: '0 0 16px' }}>
                        還需等待 {daysLeft} 天才能再次修改
                    </p>
                ) : (
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
                        placeholder="請輸入新的員工編號"
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
                )}

                {!isCoolingDown && error && (
                    <p style={{ color: '#e25563', fontSize: '13px', margin: '0 0 8px' }}>
                        {error}
                    </p>
                )}

                <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                    <button
                        className="modal-close-btn"
                        onClick={onClose}
                        style={{
                            background: '#eee',
                            color: '#666',
                            flex: 1,
                        }}
                    >
                        取消
                    </button>
                    {!isCoolingDown && (
                        <button
                            className="modal-close-btn"
                            onClick={handleSubmit}
                            disabled={loading}
                            style={{ flex: 1 }}
                        >
                            {loading ? '送出中...' : '確認修改'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
