import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { walletAPI } from '../../utils/api'
import { trackViewTransactionHistory } from '../../utils/analytics'

interface Transaction {
  id: number
  amount: number
  type: string
  note: string | null
  order_ref: string | null
  created_at: string
}

interface TransactionHistoryProps {
  isOpen: boolean
  onClose: () => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function formatAmount(amount: number): string {
  return amount >= 0 ? `+$${amount}` : `-$${Math.abs(amount)}`
}

export function TransactionHistory({ isOpen, onClose }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [balance, setBalance] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    trackViewTransactionHistory()
    setLoading(true)
    setError(false)
    walletAPI.getBalance()
      .then((res) => {
        if (res.data?.success) {
          setBalance(res.data.balance ?? 0)
          setTransactions(res.data.transactions ?? [])
        } else {
          setError(true)
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [isOpen])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key='history-bg'
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10002,
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
              justifyContent: 'space-between',
              padding: '16px 20px',
              background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%)',
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
                🧾 消費紀錄
              </h2>
              <p style={{ color: '#aaa', fontSize: '14px', margin: '3px 0 0' }}>
                餘額：
                <span style={{ color: '#2ecc71', fontWeight: 'bold' }}>
                  ${balance}
                </span>
                <span style={{ color: '#666', fontSize: '11px', marginLeft: '8px' }}>
                  僅顯示近 30 日
                </span>
              </p>
            </div>
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

          {/* Content */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px 20px 24px',
            }}
          >
            {loading && (
              <p style={{ color: '#aaa', textAlign: 'center', marginTop: '40px' }}>
                載入中…
              </p>
            )}

            {!loading && error && (
              <p style={{ color: '#e74c3c', textAlign: 'center', marginTop: '40px' }}>
                載入失敗，請稍後再試
              </p>
            )}

            {!loading && !error && transactions.length === 0 && (
              <p style={{ color: '#666', textAlign: 'center', marginTop: '40px' }}>
                尚無消費紀錄
              </p>
            )}

            {!loading && !error && transactions.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {transactions.map((tx) => {
                  const isPositive = tx.amount >= 0
                  return (
                    <motion.li
                      key={tx.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 16px',
                        marginBottom: '8px',
                        borderRadius: '12px',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ color: '#e8e8e8', fontSize: '14px', fontWeight: 500 }}>
                          {tx.note ?? (isPositive ? '儲值' : '消費')}
                        </span>
                        <span style={{ color: '#888', fontSize: '12px' }}>
                          {formatDate(tx.created_at)}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: '16px',
                          fontWeight: 'bold',
                          color: isPositive ? '#2ecc71' : '#e74c3c',
                        }}
                      >
                        {formatAmount(tx.amount)}
                      </span>
                    </motion.li>
                  )
                })}
              </ul>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
