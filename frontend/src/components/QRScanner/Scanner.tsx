import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QRScannerProps {
    onScanSuccess: (decodedText: string) => void;
    onScanError?: (error: string) => void;
}

export function QRScanner({ onScanSuccess, onScanError }: QRScannerProps) {
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const onScanSuccessRef = useRef(onScanSuccess);
    const onScanErrorRef = useRef(onScanError);
    const [cameraError, setCameraError] = useState('');
    const [manualCode, setManualCode] = useState('');
    const [showManual, setShowManual] = useState(false);

    // 保持 callback refs 最新
    onScanSuccessRef.current = onScanSuccess;
    onScanErrorRef.current = onScanError;

    useEffect(() => {
        let mounted = true;
        let scanner: Html5Qrcode | null = null;

        const startScanner = async () => {
            try {
                // 確保 DOM 元素已經存在
                const readerEl = document.getElementById('qr-reader');
                if (!readerEl) {
                    console.error('QR reader element not found');
                    return;
                }

                scanner = new Html5Qrcode('qr-reader');
                scannerRef.current = scanner;

                const cameras = await Html5Qrcode.getCameras();
                if (!cameras || cameras.length === 0) {
                    if (mounted) {
                        setCameraError('找不到相機裝置');
                        setShowManual(true);
                    }
                    return;
                }

                await scanner.start(
                    { facingMode: 'environment' },
                    {
                        fps: 10,
                        qrbox: { width: 250, height: 250 },
                    },
                    (decodedText) => {
                        if (mounted) {
                            scanner?.stop().catch(() => { });
                            onScanSuccessRef.current(decodedText);
                        }
                    },
                    () => {
                        // 忽略 NotFoundException（正常掃描中）
                    }
                );
            } catch (err: any) {
                console.error('QR Scanner 啟動失敗:', err);
                if (mounted) {
                    const msg = typeof err === 'string' ? err : err.message || '無法啟動相機';
                    setCameraError(msg);
                    setShowManual(true);
                    if (onScanErrorRef.current) {
                        onScanErrorRef.current(msg);
                    }
                }
            }
        };

        // 延遲啟動，確保 DOM 已渲染
        const timer = setTimeout(startScanner, 100);

        return () => {
            mounted = false;
            clearTimeout(timer);
            try {
                if (scanner && scanner.isScanning) {
                    scanner.stop().catch(() => { });
                }
            } catch { /* 忽略 */ }
            scannerRef.current = null;
        };
    }, []);

    const handleManualSubmit = () => {
        const code = manualCode.trim();
        if (code) {
            // 安全停止相機（如果正在運行）
            try {
                const s = scannerRef.current;
                if (s && s.isScanning) {
                    s.stop().catch(() => { });
                }
            } catch { /* 忽略 */ }
            onScanSuccess(code);
        }
    };

    return (
        <div className="qr-scanner-container" style={{ width: '100%' }}>
            {/* 相機掃描區 */}
            {!cameraError && (
                <div
                    id="qr-reader"
                    style={{
                        width: '100%',
                        maxWidth: '500px',
                        minHeight: '300px',
                        margin: '0 auto',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        background: '#000',
                    }}
                />
            )}

            {/* 相機錯誤提示 */}
            {cameraError && (
                <div style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: '#ff6b6b',
                    background: '#fff3f3',
                    borderRadius: '12px',
                    marginBottom: '16px',
                }}>
                    <p style={{ margin: '0 0 8px 0', fontWeight: 'bold' }}>📷 相機無法開啟</p>
                    <p style={{ margin: 0, fontSize: '14px', color: '#999' }}>{cameraError}</p>
                </div>
            )}

            {/* 切換手動輸入 */}
            {!showManual && (
                <button
                    onClick={() => setShowManual(true)}
                    style={{
                        display: 'block',
                        margin: '16px auto 0',
                        background: 'none',
                        border: 'none',
                        color: '#667eea',
                        cursor: 'pointer',
                        fontSize: '14px',
                        textDecoration: 'underline',
                    }}
                >
                    ⌨️ 手動輸入代碼
                </button>
            )}

            {/* 手動輸入區 */}
            {showManual && (
                <div style={{
                    marginTop: '16px',
                    padding: '16px',
                    background: '#f8f9fa',
                    borderRadius: '12px',
                    border: '1px solid #e0e0e0',
                }}>
                    <p style={{
                        margin: '0 0 12px 0',
                        fontSize: '14px',
                        color: '#555',
                        fontWeight: 'bold',
                    }}>
                        ⌨️ 手動輸入 QR Code 代碼
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <input
                            type="text"
                            value={manualCode}
                            onChange={(e) => setManualCode(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                            placeholder="請輸入代碼..."
                            style={{
                                width: '100%',
                                padding: '12px 16px',
                                borderRadius: '8px',
                                border: '2px solid #ddd',
                                fontSize: '16px',
                                outline: 'none',
                                transition: 'border-color 0.2s',
                                boxSizing: 'border-box',
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#667eea'}
                            onBlur={(e) => e.target.style.borderColor = '#ddd'}
                            autoFocus={!!cameraError}
                        />
                        <button
                            onClick={handleManualSubmit}
                            disabled={!manualCode.trim()}
                            style={{
                                width: '100%',
                                padding: '12px',
                                background: manualCode.trim() ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#ccc',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '16px',
                                fontWeight: 'bold',
                                cursor: manualCode.trim() ? 'pointer' : 'not-allowed',
                            }}
                        >
                            送出
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
