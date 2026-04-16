// analytics.ts — GA4 事件追蹤封裝
// 所有 gtag 呼叫都透過此模組，方便統一管理與測試
// 注意：不追蹤任何 PII（user ID、email、QR code 值等個人資訊）

declare function gtag(command: string, action: string, params?: Record<string, unknown>): void

// GA4 初始化 — 動態注入 gtag.js
// 使用 import.meta.env（Vite 在 dev 和 build 兩種模式下都可靠）
function initGA4(): void {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined
  if (!measurementId) return

  // 注入 gtag.js script
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  document.head.appendChild(script)

  // 初始化 dataLayer 和 gtag 函式
  // ⚠️ 必須用 arguments 物件（不能用 ...args spread）
  // GA4 的 gtag.js 載入後會掃描 dataLayer，只處理 Arguments 物件格式的指令
  window.dataLayer = window.dataLayer || []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments)
  }
  ;(window as any).gtag('js', new Date())
  ;(window as any).gtag('config', measurementId)
}

// 模組載入時自動初始化（只執行一次）
initGA4()

function safeGtag(action: string, params: Record<string, unknown>): void {
  if (typeof gtag === 'function') {
    gtag('event', action, params)
  }
}

export function trackEvent(eventName: string, params: Record<string, unknown>): void {
  safeGtag(eventName, params)
}

export function trackPageView(pagePath: string): void {
  safeGtag('page_view', { page_path: pagePath })
}

export function trackLoginSuccess(method: string): void {
  safeGtag('login_success', { method })
}

export function trackQRScan(result: 'success' | 'error'): void {
  safeGtag('qr_scan', { result })
}

export function trackGachaDraw(cardId: number, isNew: boolean): void {
  safeGtag('gacha_draw', { card_id: cardId, is_new: isNew })
}

// GA4 標準事件：新會員首次註冊
export function trackSignUp(method: string): void {
  safeGtag('sign_up', { method })
}

// 分享卡片被成功領取
export function trackShareCardClaimed(cardId: number, isNewCard: boolean): void {
  safeGtag('share_card_claimed', { card_id: cardId, is_new_card: isNewCard })
}
