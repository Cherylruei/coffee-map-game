import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { TransactionHistory } from './TransactionHistory'

// ── API mock ──────────────────────────────────────────────────────────────────

vi.mock('../../utils/api', () => ({
  walletAPI: {
    getBalance: vi.fn(),
  },
}))

vi.mock('../../utils/analytics', () => ({
  trackViewTransactionHistory: vi.fn(),
}))

import { walletAPI } from '../../utils/api'
import { trackViewTransactionHistory } from '../../utils/analytics'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockTransactions = [
  {
    id: 1,
    amount: 150,
    type: 'topup',
    note: '現金儲值',
    order_ref: null,
    created_at: '2026-04-15T10:30:00Z',
    payment_method: 'cash',
  },
  {
    id: 2,
    amount: -60,
    type: 'deduct',
    note: '點單消費',
    order_ref: 'ORD-001',
    created_at: '2026-04-16T14:00:00Z',
    payment_method: 'line_pay',
  },
  {
    id: 3,
    amount: 200,
    type: 'topup',
    note: '現金儲值',
    order_ref: null,
    created_at: '2026-04-17T09:00:00Z',
    payment_method: 'cash',
  },
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TransactionHistory', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(walletAPI.getBalance).mockResolvedValue({
      data: {
        success: true,
        balance: 290,
        transactions: mockTransactions,
      },
    } as any)
  })

  it('掛載時呼叫 trackViewTransactionHistory', async () => {
    await act(async () => {
      render(<TransactionHistory {...defaultProps} />)
    })
    expect(trackViewTransactionHistory).toHaveBeenCalledTimes(1)
  })

  it('顯示「消費紀錄」標題', async () => {
    await act(async () => {
      render(<TransactionHistory {...defaultProps} />)
    })
    expect(screen.getByText(/消費紀錄/)).toBeInTheDocument()
  })

  it('API 回傳交易時顯示所有筆數', async () => {
    await act(async () => {
      render(<TransactionHistory {...defaultProps} />)
    })
    await waitFor(() => {
      // 兩筆現金儲值 + 一筆點單消費
      expect(screen.getAllByText('現金儲值')).toHaveLength(2)
      expect(screen.getByText('點單消費')).toBeInTheDocument()
    })
  })

  it('儲值筆數顯示 + 金額（綠色）', async () => {
    await act(async () => {
      render(<TransactionHistory {...defaultProps} />)
    })
    await waitFor(() => {
      // 有兩筆儲值，找 +$150
      expect(screen.getByText('+$150')).toBeInTheDocument()
    })
  })

  it('消費筆數顯示 - 金額（紅色/muted）', async () => {
    await act(async () => {
      render(<TransactionHistory {...defaultProps} />)
    })
    await waitFor(() => {
      expect(screen.getByText('-$60')).toBeInTheDocument()
    })
  })

  it('API 回傳空陣列時顯示「尚無消費紀錄」', async () => {
    vi.mocked(walletAPI.getBalance).mockResolvedValue({
      data: { success: true, balance: 0, transactions: [] },
    } as any)

    await act(async () => {
      render(<TransactionHistory {...defaultProps} />)
    })
    await waitFor(() => {
      expect(screen.getByText('尚無消費紀錄')).toBeInTheDocument()
    })
  })

  it('API 失敗時顯示錯誤訊息', async () => {
    vi.mocked(walletAPI.getBalance).mockRejectedValue(new Error('network'))

    await act(async () => {
      render(<TransactionHistory {...defaultProps} />)
    })
    await waitFor(() => {
      expect(screen.getByText('載入失敗，請稍後再試')).toBeInTheDocument()
    })
  })

  it('顯示目前餘額', async () => {
    await act(async () => {
      render(<TransactionHistory {...defaultProps} />)
    })
    await waitFor(() => {
      expect(screen.getByText('$290')).toBeInTheDocument()
    })
  })

  it('顯示付款方式與儲值來源', async () => {
    await act(async () => {
      render(<TransactionHistory {...defaultProps} />)
    })

    await waitFor(() => {
      expect(screen.getAllByText('儲值來源：現金')).toHaveLength(2)
      expect(screen.getByText('付款方式：LINE Pay')).toBeInTheDocument()
    })
  })
})
