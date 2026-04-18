import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { act } from 'react'
import { WalletBalance } from './WalletBalance'
import { WalletPaymentModal } from './WalletPaymentModal'
import { useWalletStore } from '../../hooks/useWallet'

// ── useWallet ──────────────────────────────────────────────────────────────

vi.mock('../../utils/api', () => ({
  walletAPI: {
    getBalance: vi.fn(),
  },
}))

import { walletAPI } from '../../utils/api'

describe('useWalletStore', () => {
  beforeEach(() => {
    useWalletStore.setState({ balance: 0, loaded: false })
    vi.clearAllMocks()
  })

  it('初始狀態：balance=0, loaded=false', () => {
    const { balance, loaded } = useWalletStore.getState()
    expect(balance).toBe(0)
    expect(loaded).toBe(false)
  })

  it('fetchBalance 成功時更新 balance 與 loaded', async () => {
    vi.mocked(walletAPI.getBalance).mockResolvedValue({
      data: { success: true, balance: 250 },
    } as any)

    await act(async () => {
      await useWalletStore.getState().fetchBalance()
    })

    expect(useWalletStore.getState().balance).toBe(250)
    expect(useWalletStore.getState().loaded).toBe(true)
  })

  it('fetchBalance API 回傳 success=false 時不更新 balance', async () => {
    vi.mocked(walletAPI.getBalance).mockResolvedValue({
      data: { success: false },
    } as any)

    await act(async () => {
      await useWalletStore.getState().fetchBalance()
    })

    expect(useWalletStore.getState().balance).toBe(0)
    expect(useWalletStore.getState().loaded).toBe(false)
  })

  it('fetchBalance 拋出錯誤時靜默忽略（不 crash）', async () => {
    vi.mocked(walletAPI.getBalance).mockRejectedValue(new Error('network'))

    await expect(
      act(async () => {
        await useWalletStore.getState().fetchBalance()
      })
    ).resolves.not.toThrow()
  })

  it('setBalance 直接更新 balance 與 loaded', () => {
    act(() => {
      useWalletStore.getState().setBalance(500)
    })
    expect(useWalletStore.getState().balance).toBe(500)
    expect(useWalletStore.getState().loaded).toBe(true)
  })
})

// ── WalletBalance ──────────────────────────────────────────────────────────

describe('WalletBalance', () => {
  beforeEach(() => {
    useWalletStore.setState({ balance: 0, loaded: false })
  })

  it('loaded=false 時不渲染任何內容', () => {
    const { container } = render(<WalletBalance />)
    expect(container.firstChild).toBeNull()
  })

  it('loaded=true 時顯示餘額', () => {
    useWalletStore.setState({ balance: 300, loaded: true })
    render(<WalletBalance />)
    expect(screen.getByText('$300')).toBeInTheDocument()
  })

  it('餘額為 0 時顯示 $0', () => {
    useWalletStore.setState({ balance: 0, loaded: true })
    render(<WalletBalance />)
    expect(screen.getByText('$0')).toBeInTheDocument()
  })
})

// ── WalletPaymentModal ─────────────────────────────────────────────────────

describe('WalletPaymentModal', () => {
  const baseProps = {
    amount: 100,
    currentBalance: 200,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('顯示正確的扣款金額與扣後餘額', () => {
    // amount=100, balance=200 → afterBalance=100（$100 出現兩次：即將扣款 + 扣款後餘額）
    render(<WalletPaymentModal {...baseProps} />)
    expect(screen.getAllByText('$100')).toHaveLength(2)
    expect(screen.getByText('$200')).toBeInTheDocument()
  })

  it('餘額充足時確認鈕可點擊', () => {
    render(<WalletPaymentModal {...baseProps} />)
    expect(screen.getByText('確認付款')).not.toBeDisabled()
  })

  it('餘額不足時確認鈕 disabled 並顯示警告訊息', () => {
    render(<WalletPaymentModal {...baseProps} currentBalance={50} />)
    expect(screen.getByText('確認付款')).toBeDisabled()
    // 找警告 div（含 emoji 的完整文字），避免與 row value 的「餘額不足」衝突
    expect(screen.getByText('⚠️ 餘額不足，請先至門市儲值')).toBeInTheDocument()
  })

  it('點擊確認鈕呼叫 onConfirm', () => {
    render(<WalletPaymentModal {...baseProps} />)
    fireEvent.click(screen.getByText('確認付款'))
    expect(baseProps.onConfirm).toHaveBeenCalledTimes(1)
  })

  it('點擊取消鈕呼叫 onCancel', () => {
    render(<WalletPaymentModal {...baseProps} />)
    fireEvent.click(screen.getByText('取消'))
    expect(baseProps.onCancel).toHaveBeenCalledTimes(1)
  })

  it('loading=true 時確認鈕顯示「處理中…」且 disabled', () => {
    render(<WalletPaymentModal {...baseProps} loading={true} />)
    expect(screen.getByText('處理中…')).toBeDisabled()
  })
})
