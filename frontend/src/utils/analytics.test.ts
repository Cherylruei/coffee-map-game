import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  trackEvent,
  trackPageView,
  trackLoginSuccess,
  trackQRScan,
  trackGachaDraw,
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
})
