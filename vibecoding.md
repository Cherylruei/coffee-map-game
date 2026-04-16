# Vibecoding 學習筆記
## Coffee Map Game × Everything Claude Code

> 本文記錄使用 AI + ECC 工具流程開發功能的學習過程

---

## 一、ECC 是什麼？

**ECC = Everything Claude Code**

一個開源的 Claude Code 擴充套件包，由社群維護，安裝後會在 `~/.claude/` 目錄加入大量工具。

### 它包含什麼？

| 類型 | 說明 | 例子 |
|------|------|------|
| **skills** | 特定領域的深度知識 | `frontend-patterns`、`database-migrations` |
| **agents** | 專門的 AI 代理人，執行特定任務 | `code-reviewer`、`security-reviewer` |
| **commands** | slash 指令，觸發完整工作流程 | `/plan`、`/tdd`、`/code-review` |
| **rules** | 自動載入的編碼規範 | TypeScript 命名規則、安全性規則 |
| **hooks** | 程式碼寫完後自動執行的動作 | 存檔後自動 lint、型別檢查 |

### 安裝方式（本次做法）

```bash
# 更新到最新版
cd ~/everything-claude-code && git pull

# 安裝到 ~/.claude/（針對 TypeScript 專案）
node scripts/install-apply.js --target claude typescript
```

安裝後就能在對話中使用 `/plan`、`/tdd`、`/code-review` 等指令。

---

## 二、TDD 工作流程

**TDD = Test-Driven Development（測試驅動開發）**

### 核心概念：先寫測試，再寫程式

```
🔴 RED   → 先寫測試（此時還沒有實作，測試一定失敗）
🟢 GREEN → 寫最小實作讓測試通過
🔵 REFACTOR → 重構，讓程式碼更乾淨，測試依然通過
```

### 為什麼這樣做？

- **強迫你先思考「這個函式應該做什麼」**，而不是邊寫邊猜
- 測試本身就是活文件，未來看測試就知道函式的預期行為
- 重構時有安全網，不怕改壞

### 本次使用的指令

```
/tdd  → 告訴 Claude 用 TDD 流程實作功能
```

---

## 三、本次安裝的測試框架

原本專案沒有測試框架，本次安裝了：

| 套件 | 用途 |
|------|------|
| `vitest` | 測試執行器（Vite 原生支援，速度快） |
| `@vitest/coverage-v8` | 計算測試覆蓋率 |
| `jsdom` | 在 Node.js 中模擬瀏覽器環境 |
| `@testing-library/react` | React 元件測試工具 |
| `@testing-library/jest-dom` | 額外的 DOM 斷言（如 `toBeInTheDocument()`） |

### 執行測試的指令

```bash
cd frontend

npm test               # 執行一次（CI 用）
npm run test:watch     # 監看模式，存檔自動重跑（開發時用）
npm run test:coverage  # 執行並產生覆蓋率報告
```

### 設定檔

測試設定寫在 `vite.config.ts` 的 `test` 區塊：

```typescript
test: {
  environment: 'jsdom',       // 模擬瀏覽器
  setupFiles: ['./src/test-setup.ts'],  // 每個測試前執行
  globals: true,              // 可以直接用 describe/it/expect 不用 import
  coverage: {
    thresholds: { lines: 80 } // 至少 80% 覆蓋率
  }
}
```

---

## 四、GA4 是什麼？如何運作？

**GA4 = Google Analytics 4**，Google 的免費流量分析工具。

### 運作原理

```
使用者行為（點擊、掃碼、抽卡）
    ↓
你的程式呼叫 analytics.ts 裡的追蹤函式
    ↓
analytics.ts 呼叫 gtag('event', '事件名稱', { 參數 })
    ↓
gtag.js 將資料送往 Google 伺服器
    ↓
GA4 後台 → 圖表、報表、漏斗分析
```

### 本專案的實作架構

```
src/utils/analytics.ts
  ├─ initGA4()         ← 模組載入時自動執行，動態注入 gtag.js
  ├─ safeGtag()        ← 內部函式，確認 gtag 存在才呼叫（防 crash）
  ├─ trackPageView()   ← 頁面瀏覽
  ├─ trackLoginSuccess() ← LINE 登入成功
  ├─ trackQRScan()     ← 掃描 QR Code
  └─ trackGachaDraw()  ← 抽卡

src/App.tsx
  └─ import analytics.ts，在對應操作中呼叫追蹤函式
```

### 為什麼把初始化放在 analytics.ts 而不是 index.html？

Vite 有兩種讀取環境變數的方式：
- `index.html` 用 `%VITE_*%` → **只在 build 時替換，dev 模式不可靠**
- TypeScript 用 `import.meta.env.VITE_*` → **dev 和 build 兩種模式都可靠** ✅

所以我們把 GA4 初始化移到 TypeScript 裡，確保本地開發也能正常運作。

---

## 五、GA4 埋入網站完整步驟

### Step 1：在 GA4 建立資源

1. 前往 [analytics.google.com](https://analytics.google.com)
2. 點擊左下角**管理（齒輪圖示）**
3. **建立** → **資源** → 填入資源名稱（如「咖啡地圖遊戲」）
4. 選擇時區（台灣 = UTC+8）、幣別
5. 選擇「網站」平台
6. 填入你的網站 URL：`https://coffee-map-game.vercel.app/`
7. 建立完成後，GA4 會給你一個**評估 ID**，格式 `G-XXXXXXXXXX`

### Step 2：確認你的資訊

```
本專案的 GA4 資訊：
  串流 ID：14381483714
  評估 ID：G-VHM44YPXMR
  前台網址：https://coffee-map-game.vercel.app/
```

### Step 3：填入 Measurement ID

**本地開發（`.env` 檔案）**
```bash
# frontend/.env
VITE_GA_MEASUREMENT_ID=G-VHM44YPXMR
```

**Vercel 正式環境（⚠️ 必做，否則 Production 不會有 GA4）**
1. 前往 [vercel.com](https://vercel.com) → 你的 `coffee-map-game` 專案
2. **Settings** → **Environment Variables**
3. 點擊 **Add New**
4. Name: `VITE_GA_MEASUREMENT_ID`
5. Value: `G-VHM44YPXMR`
6. 環境選 **Production**（也可以同時選 Preview）
7. 儲存後 → **Deployments** → **Redeploy**（重新部署才會生效）

### Step 4：程式碼如何連動

`analytics.ts` 的 `initGA4()` 函式在模組載入時自動執行：

```typescript
function initGA4(): void {
  // 讀取 Vite 環境變數（只在有填值時才初始化）
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID

  if (!measurementId) return  // 沒填 ID → 不載入 GA，不影響功能

  // 動態建立 <script> 標籤，載入 gtag.js
  const script = document.createElement('script')
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  document.head.appendChild(script)

  // 初始化 gtag
  window.gtag('js', new Date())
  window.gtag('config', measurementId)
}

initGA4()  // App 啟動時自動執行
```

然後 `App.tsx` 在適當時機呼叫追蹤：

```typescript
// LINE 登入成功時
trackLoginSuccess('LINE')

// QR 掃碼成功時
trackQRScan('success')

// 抽卡時
trackGachaDraw(cardId, isNew)

// 頁面載入時
trackPageView('/')
```

---

## 六、本地是否能測試 GA4？

**可以，但有限制：**

| 狀況 | 本地能測試？ | 說明 |
|------|------------|------|
| GA4 事件送出（技術層面）| ✅ 可以 | `.env` 填入 ID 後，`npm run dev` 啟動，GA4 會收到事件 |
| GA4 即時報表看到數據 | ✅ 可以 | localhost 的流量 GA4 一樣能收 |
| 與正式環境數據分開 | ⚠️ 需注意 | 本地和 Vercel 共用同一個 GA4 資源，數據會混在一起 |

### 建議：本地和正式環境分開追蹤

如果你想區分「開發中的測試操作」和「真實用戶行為」：

**方法 A：本地不填 ID（最簡單）**
```bash
# frontend/.env（本地）
VITE_GA_MEASUREMENT_ID=   # 留空 → 本地不送 GA4
```
只有 Vercel 上有 GA4，本地的操作不會污染數據。

**方法 B：建立兩個 GA4 資料串流（最完整）**
1. GA4 同一個資源，建立第二個串流
2. 本地 `.env` 用測試串流的 ID
3. Vercel 環境變數用正式串流的 ID

---

## 七、本次寫了哪些測試？

檔案：`frontend/src/utils/analytics.test.ts`（13 個測試）

### 測試群組說明

#### 1. `trackEvent` 基礎測試（3 個）
```
✓ 有 gtag 時，正確呼叫 gtag('event', 事件名, 參數)
✓ gtag 未載入時不 crash（graceful fallback）
✓ gtag 不是函式時不 crash
```

#### 2. `trackPageView` 頁面瀏覽（2 個）
```
✓ 呼叫 page_view 事件，帶入 page_path
✓ gtag 未載入時不 crash
```

#### 3. `trackLoginSuccess` 登入成功（3 個）
```
✓ 呼叫 login_success 事件，帶入 method: 'LINE'
✓ 不包含 user_id（隱私保護）
✓ 不包含 line_user_id、email（隱私保護）
```

#### 4. `trackQRScan` QR 掃描（3 個）
```
✓ 呼叫 qr_scan 事件，帶入 result: 'success'
✓ 不包含 qr_code 的實際值（隱私保護）
✓ gtag 未載入時不 crash
```

#### 5. `trackGachaDraw` 抽卡（2 個）
```
✓ 呼叫 gacha_draw 事件，帶入 card_id 和 is_new
✓ gtag 未載入時不 crash
```

### 覆蓋率結果

```
File          | % Stmts | % Branch | % Funcs | % Lines
analytics.ts  |   100%  |   100%   |   100%  |   100%
```

---

## 八、目前加入了哪些追蹤？

| 事件名稱 | 在哪裡觸發 | 帶入的參數 | GA4 後台查看位置 |
|---------|----------|-----------|----------------|
| `page_view` | App 掛載時 | `page_path: '/'` | 報表 → 參與度 → 頁面 |
| `login_success` | LINE 登入成功後 | `method: 'LINE'` | 報表 → 事件 |
| `qr_scan` | QR 掃碼成功/失敗 | `result: 'success'/'error'` | 報表 → 事件 |
| `gacha_draw` | 抽卡成功 | `card_id: number, is_new: boolean` | 報表 → 事件 |

---

## 九、尚未加入的追蹤（待辦）

### 問題：初次登入的新會員怎麼追蹤？

目前 `login_success` 無法區分「新會員」vs「舊會員回訪」。

**解法：後端回傳 `isNewUser` 欄位**

```typescript
// App.tsx 的 LINE callback 處理
const response = await authAPI.lineCallback(code, redirectUri);
if (response.data.success) {
  if (response.data.isNewUser) {
    trackEvent('sign_up', { method: 'LINE' })  // GA4 標準事件名稱
  }
  trackLoginSuccess('LINE')
}
```

**GA4 後台可查：** 事件 → `sign_up` → 每日新增會員趨勢

### 問題：透過好友分享卡片加入的會員怎麼追蹤？

目前分享流程（`?share=xxx` URL 參數）沒有追蹤。

**解法：在分享領取成功時追蹤**

```typescript
// App.tsx 的 shareCode 處理
const response = await shareAPI.claim(shareCode);
if (response.data.success) {
  trackEvent('share_card_claimed', {
    card_id: response.data.card.id,
    is_new_user: response.data.isNewUser ?? false,
  })
}
```

**GA4 後台可查：**
- 事件 → `share_card_claimed` → 分享帶來的互動數
- 搭配 `sign_up` 事件 → 可算出「分享帶來新會員的比例」

### 其他待加入的追蹤（功能 2-4 完成後）

| 事件 | 觸發時機 |
|------|---------|
| `topup_complete` | 現金儲值完成 |
| `purchase_credit` | 使用儲值金消費 |
| `view_transaction_history` | 查看消費紀錄 |
| `report_export` | 匯出 Excel 報表 |

---

## 十、驗證 GA4 是否正常運作

### 方法 A：GA4 即時報表（最快）

1. GA4 後台 → 左側選單 **「報表」** → **「即時」**
2. 開啟 [https://coffee-map-game.vercel.app/](https://coffee-map-game.vercel.app/)
3. 即時報表應顯示「1 位活躍用戶」
4. 執行操作（掃碼、抽卡），事件列表會出現對應事件名稱

> ⏱️ 即時報表延遲約 10-30 秒，一般報表數據延遲 24-48 小時才顯示

### 方法 B：瀏覽器 DevTools Network（不需任何工具）

1. 開啟前台 → 按 `F12` → **Network** 分頁
2. 在篩選欄輸入 `collect`
3. 執行任何追蹤操作（開啟頁面、登入等）
4. 應看到送往 `https://www.google-analytics.com/g/collect` 的請求
5. 點擊請求 → **Payload** → 可看到送出的事件資料

### 方法 C：GA4 DebugView（最詳細，推薦開發時用）

1. Chrome 安裝 **[Google Analytics Debugger](https://chrome.google.com/webstore/detail/google-analytics-debugger/jnkmfdileelhofjcijamephohjechhna)** 擴充功能
2. 點擊擴充功能圖示開啟（按鈕變藍色 = 啟動）
3. 前往你的網站，執行各種操作
4. GA4 後台 → 左側 **「管理（齒輪）」** → **「DebugView」**
5. 可即時看到每個事件、參數、時間序列

---

## 十一、ECC 工作流程複習

```
開始新功能
    ↓
/plan → 規劃、確認方向
    ↓
/tdd → 先寫測試（RED）→ 實作（GREEN）→ 重構（REFACTOR）
    ↓
/code-review → 審查程式碼品質
    ↓
/security-review → 安全性審查（涉及金流/認證時必做）
    ↓
/verify → 確認整合正確
```

### 本次用到的 ECC 指令

| 指令 | 用途 | 本次用在哪 |
|------|------|-----------|
| `/plan` | 規劃功能架構 | 規劃 5 個新功能的計畫 |
| `/tdd` | TDD 工作流程 | 實作 GA4 analytics.ts |

### 下次會用到的

| 指令 | 用途 | 會用在哪 |
|------|------|---------|
| `/code-review` | 審查程式碼 | 每個功能完成後 |
| `/security-review` | 安全審查 | 現金儲值（功能 2）|
| `database-migrations` skill | 資料庫 migration | 儲值金表格設計 |
| `/schedule` | 設定排程 | 每月自動報表（功能 4）|

---

## 十二、專案架構快速參考

```
coffee-map-game/
├── backend/
│   └── server-supabase.js     ← Node.js API（Vercel 部署）
├── frontend/                  ← 顧客前台（React + Vite）
│   ├── .env                   ← 本地環境變數（含 GA4 ID）
│   └── src/
│       ├── App.tsx            ← 主要邏輯（登入、掃碼、抽卡）
│       └── utils/
│           ├── analytics.ts   ← GA4 追蹤（本次新增）✨
│           └── api.ts         ← API 呼叫封裝
└── merchant/                  ← 商家後台（React + Vite）
    └── src/
        ├── App.tsx
        └── components/
            ├── OrderTab.tsx   ← 點單流程
            ├── MenuTab.tsx    ← 菜單管理（功能 1 要修改）
            └── GachaTab.tsx   ← 抽卡 QR 生成
```

---

*最後更新：2026-04-16*
*下一步：功能 1（後台菜單直接編輯）*
