import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  trackEvent,
  trackPageView,
  trackLoginSuccess,
  trackQRScan,
  trackGachaDraw,
  trackSignUp,
  trackShareCardClaimed,
  trackWalletTopup,
  trackViewTransactionHistory,
} from './analytics'

describe('analytics', () => {
  beforeEach(() => {
    // 清除 window.gtag mock
    vi.stubGlobal('gtag', undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('trackEvent', () => {
    it('calls gtag with correct event name and params', () => {
      const mockGtag = vi.fn()
      vi.stubGlobal('gtag', mockGtag)

      trackEvent('test_event', { category: 'test' })

      expect(mockGtag).toHaveBeenCalledWith('event', 'test_event', {
        category: 'test',
      })
    })

    it('does not throw when gtag is not loaded', () => {
      // gtag 未載入時不應 crash（graceful fallback）
      expect(() => trackEvent('test_event', {})).not.toThrow()
    })

    it('does not throw when gtag is not a function', () => {
      vi.stubGlobal('gtag', 'not-a-function')
      expect(() => trackEvent('test_event', {})).not.toThrow()
    })
  })

  describe('trackPageView', () => {
    it('calls gtag with page_view event', () => {
      const mockGtag = vi.fn()
      vi.stubGlobal('gtag', mockGtag)

      trackPageView('/home')

      expect(mockGtag).toHaveBeenCalledWith('event', 'page_view', {
        page_path: '/home',
      })
    })

    it('does not throw when gtag is not loaded', () => {
      expect(() => trackPageView('/home')).not.toThrow()
    })
  })

  describe('trackLoginSuccess', () => {
    it('calls gtag with login_success event and method', () => {
      const mockGtag = vi.fn()
      vi.stubGlobal('gtag', mockGtag)

      trackLoginSuccess('LINE')

      expect(mockGtag).toHaveBeenCalledWith('event', 'login_success', {
        method: 'LINE',
      })
    })

    it('does NOT include user_id or personal info', () => {
      const mockGtag = vi.fn()
      vi.stubGlobal('gtag', mockGtag)

      trackLoginSuccess('LINE')

      const callArgs = mockGtag.mock.calls[0][2]
      expect(callArgs).not.toHaveProperty('user_id')
      expect(callArgs).not.toHaveProperty('line_user_id')
      expect(callArgs).not.toHaveProperty('email')
    })

    it('does not throw when gtag is not loaded', () => {
      expect(() => trackLoginSuccess('LINE')).not.toThrow()
    })
  })

  describe('trackQRScan', () => {
    it('calls gtag with qr_scan event', () => {
      const mockGtag = vi.fn()
      vi.stubGlobal('gtag', mockGtag)

      trackQRScan('success')

      expect(mockGtag).toHaveBeenCalledWith('event', 'qr_scan', {
        result: 'success',
      })
    })

    it('does NOT include the actual QR code value (PII risk)', () => {
      const mockGtag = vi.fn()
      vi.stubGlobal('gtag', mockGtag)

      trackQRScan('success')

      const callArgs = mockGtag.mock.calls[0][2]
      expect(callArgs).not.toHaveProperty('qr_code')
      expect(callArgs).not.toHaveProperty('code')
    })

    it('does not throw when gtag is not loaded', () => {
      expect(() => trackQRScan('success')).not.toThrow()
    })
  })

  describe('trackGachaDraw', () => {
    it('calls gtag with gacha_draw event and card_id', () => {
      const mockGtag = vi.fn()
      vi.stubGlobal('gtag', mockGtag)

      trackGachaDraw(5, true)

      expect(mockGtag).toHaveBeenCalledWith('event', 'gacha_draw', {
        card_id: 5,
        is_new: true,
      })
    })

    it('does not throw when gtag is not loaded', () => {
      expect(() => trackGachaDraw(1, false)).not.toThrow()
    })
  })

  describe('trackSignUp', () => {
    it('calls gtag with sign_up event and method', () => {
      const mockGtag = vi.fn()
      vi.stubGlobal('gtag', mockGtag)

      trackSignUp('LINE')

      expect(mockGtag).toHaveBeenCalledWith('event', 'sign_up', {
        method: 'LINE',
      })
    })

    it('does not throw when gtag is not loaded', () => {
      expect(() => trackSignUp('LINE')).not.toThrow()
    })
  })

  describe('trackShareCardClaimed', () => {
    it('calls gtag with share_card_claimed event, card_id and is_new_card', () => {
      const mockGtag = vi.fn()
      vi.stubGlobal('gtag', mockGtag)

      trackShareCardClaimed(3, true)

      expect(mockGtag).toHaveBeenCalledWith('event', 'share_card_claimed', {
        card_id: 3,
        is_new_card: true,
      })
    })

    it('does not throw when gtag is not loaded', () => {
      expect(() => trackShareCardClaimed(1, false)).not.toThrow()
    })
  })

  describe('trackWalletTopup', () => {
    it('calls gtag with topup_complete event and amount', () => {
      const mockGtag = vi.fn()
      vi.stubGlobal('gtag', mockGtag)

      trackWalletTopup(150)

      expect(mockGtag).toHaveBeenCalledWith('event', 'topup_complete', {
        amount: 150,
      })
    })

    it('does not throw when gtag is not loaded', () => {
      expect(() => trackWalletTopup(100)).not.toThrow()
    })
  })

  describe('trackViewTransactionHistory', () => {
    it('calls gtag with view_transaction_history event', () => {
      const mockGtag = vi.fn()
      vi.stubGlobal('gtag', mockGtag)

      trackViewTransactionHistory()

      expect(mockGtag).toHaveBeenCalledWith('event', 'view_transaction_history', {})
    })

    it('does not throw when gtag is not loaded', () => {
      expect(() => trackViewTransactionHistory()).not.toThrow()
    })
  })
})
