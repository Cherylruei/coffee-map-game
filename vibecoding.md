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

檔案：`frontend/src/utils/analytics.test.ts`（**17 個測試**）

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

#### 6. `trackSignUp` 新會員（2 個）
```
✓ 呼叫 sign_up 事件，帶入 method: 'LINE'
✓ gtag 未載入時不 crash
```

#### 7. `trackShareCardClaimed` 分享領取（2 個）
```
✓ 呼叫 share_card_claimed 事件，帶入 card_id 和 is_new_card
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
| `sign_up` | LINE 新會員首次登入 | `method: 'LINE'` | 報表 → 事件 → sign_up |
| `share_card_claimed` | 好友分享連結被領取 | `card_id: number, is_new_card: boolean` | 報表 → 事件 |

---

## 九、追蹤實作細節

### `sign_up`：後端偵測新會員並回傳 `isNewUser`

後端 `server-supabase.js` 在 LINE callback 時，判斷使用者是否第一次登入：

```typescript
// App.tsx 的 LINE callback 處理
const response = await authAPI.lineCallback(code, redirectUri);
if (response.data.success) {
  if (response.data.isNewUser) trackSignUp('LINE')   // 只在新會員觸發
  trackLoginSuccess('LINE')
}
```

**GA4 後台可查：** 事件 → `sign_up` → 每日新增會員趨勢

### `share_card_claimed`：分享卡片被領取時追蹤

```typescript
// App.tsx 的 shareCode 處理
const response = await shareAPI.claim(shareCode);
if (response.data.success) {
  trackShareCardClaimed(response.data.card.id, response.data.isNew)
}
```

**GA4 後台可查：**
- 事件 → `share_card_claimed` → 分享帶來的互動數
- 搭配 `sign_up` 事件 → 可算出「分享帶來新會員的比例」

### 待加入的追蹤（功能 2-4 完成後）

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

## 十三、資安觀念：防竄改系統

> 這次為錢包和卡片系統加上了四層防護，以下用白話解釋每一層在做什麼。

### 背景：為什麼需要防竄改？

你的 App 有一台「兌換機」——用戶拿 QR Code 換取儲值或抽卡次數。  
如果有人動了手腳，可以讓兌換機以為同一張 QR 是全新的，就能無限兌換。  
以下四個機制就是在堵住這些漏洞。

---

### 防護一：Race Condition（競態條件）

**比喻：廁所門鎖**

| 有問題的流程（原本）| 修好的流程（現在）|
|---|---|
| 步驟1：查 QR 是否已用 → 「沒有」 | 【鎖門：其他人等在外面】 |
| 步驟2：加錢到帳戶 | 查 QR → 沒用過 → 標記已用 → 加錢 |
| 步驟3：標記 QR 已使用 | 【開門：下一個人才能進來，看到「已使用」被擋回去】 |
| ⚠️ 兩個請求同時送，都過了步驟1 → 雙重入帳 | ✅ 第二個請求進來時，資料已鎖定 |

**技術名詞：** `SELECT ... FOR UPDATE`（PostgreSQL 資料庫鎖）

**影響的三個操作：**
- 儲值 QR 掃描 → `topup_wallet()` RPC
- 點單 QR 換抽卡次數 → `claim_order_qr()` RPC
- 抽卡按鈕連按 → `perform_draw()` RPC

**核心概念：Atomic Operation（原子操作）**
> 「原子」的意思是「不可再分割」。  
> 把多個步驟打包成一個，要嘛全部成功，要嘛全部失敗，  
> 不可能只完成一半——這樣就不會有步驟之間被人插進來的空隙。

---

### 防護二：Rate Limiting（速率限制）

**比喻：門口計數員**

就算 QR Code 是亂數，只要有人寫程式一秒試 1000 次，  
還是有機會碰巧猜到一個有效的代碼。  
Rate Limiting 就是在門口站一個計數員，超過次數就把你擋在門外。

```
用戶每分鐘只能試：
  wallet/topup   → 5 次   （儲值是金融操作，正常人一次頂多掃1張）
  gacha/pull     → 10 次  （正常人不會一分鐘刷10次）
  gacha/draw     → 30 次  （抽卡有動畫，30次已是人類操作極限）
```

超過就回傳：`請求過於頻繁，請稍後再試`

**為什麼有效？**  
機器人腳本就算 24 小時不停，每分鐘也只能試 5 次儲值 = 一小時 300 次。  
QR Code 是 UUID（128 位元亂數），要猜中機率幾近於零。

**使用套件：** `express-rate-limit`（Node.js 中間件）

---

### 防護三：RLS 收緊（關掉側門）

**比喻：咖啡廳前門 vs 側門**

```
前門（後端 API）
  ├─ 有保全（JWT 身分驗證）
  ├─ 有邏輯檢查（你只能改自己的資料）
  └─ 安全 ✅

側門（Supabase 資料庫直連）
  ├─ 原本：USING (true) = 無條件通過，任何人都能讀全部用戶的資料 ⚠️
  └─ 修好：移除寬鬆政策，anon key 直連無法讀取任何核心資料 ✅
```

**技術名詞：** RLS = Row Level Security（資料列層級安全）  
Supabase 的資料庫安全機制，控制「哪些人可以讀/寫哪些列」。

**修法：**
```sql
-- 原本（危險）
FOR SELECT USING (true)   ← true = 無條件通過

-- 修好（移除）
DROP POLICY "Users can read own data" ON users;
-- 結果：anon key 讀不到任何東西，只有後端 service key 可以操作
```

**為什麼前端不受影響？**  
前端完全沒有 Supabase client，全部操作都走後端 API，  
後端用 service key（超級管理員鑰匙）繞過 RLS，正常運作。

---

### 防護四：Audit Log（稽核日誌）

**比喻：監視錄影機**

`collection_audit` 這張表就是監視器——  
每次卡片數量有任何變動，資料庫**自動記錄一筆**：

```
用戶A | 卡片3號 | 2張→3張 | 來源：抽卡 | 時間：10:32:15
用戶A | 卡片3號 | 3張→2張 | 來源：分享 | 時間：11:05:42
```

**為什麼用觸發器（Trigger）而不是後端程式寫？**

```
後端程式寫 → 如果後端有 bug 或被繞過，就沒有記錄
資料庫觸發器寫 → 只要資料庫有變動，觸發器就自動執行，100% 留下紀錄
```

觸發器是資料庫層的自動機制，程式層無法阻止它，  
就算後端被駭、邏輯出錯，稽核記錄依然存在。

**對比：**
| 資料 | 已有日誌 | 這次新增 |
|------|---------|---------|
| 錢包餘額變動 | `wallet_transactions` ✅ | — |
| 卡片數量變動 | 只有 `gacha_history`（不完整）| `collection_audit` ✅ |

---

### 這次用到的技術總結

| 技術 | 用途 |
|------|------|
| `SELECT ... FOR UPDATE` | PostgreSQL 資料庫鎖，防 race condition |
| `SECURITY DEFINER` 函式 | 以資料庫擁有者權限執行，用戶無法繞過 |
| `ON CONFLICT DO UPDATE` | Upsert 操作，不存在就新增、存在就更新 |
| RLS Policy | 控制誰能讀/寫哪些資料列 |
| Database Trigger | 資料變動時自動執行的函式 |
| `express-rate-limit` | Node.js 速率限制中間件 |
| Atomic Transaction | 多個操作打包成一個，不可分割 |

---

## 十四、這個專案可以學到什麼（完整回顧）

> 做完這個專案，你其實已經碰過了現代 Web 開發的大部分核心觀念。

### 🏗️ 全端架構

```
前台（React）→ 後端（Node.js / Express）→ 資料庫（Supabase / PostgreSQL）
                    ↑
              商家後台（React）
```

**學到的事：**
- 前後端分離的架構怎麼運作
- 多個前端（顧客端 + 商家端）共用同一個後端 API
- 環境變數（`.env`）是什麼、為什麼不能 commit 進 git

---

### 🔐 身分驗證（Auth）

**學到的事：**
- **LINE Login OAuth** 流程：第三方登入怎麼把「LINE 確認你是誰」轉換成你自己系統的帳號
- **JWT（JSON Web Token）**：不需要 server 記住 session，token 本身就帶著身分資訊
- **中間件（Middleware）**：`authenticateToken` 函式怎麼在每個需要登入的 API 前面擋著

```
用戶點「LINE 登入」
    ↓
LINE 給你一個 code
    ↓
後端用 code 換 access_token，再換 LINE 個人資料
    ↓
後端發一個自己的 JWT token 給前端
    ↓
前端之後每次 API 請求都帶著這個 token
    ↓
後端驗證 token → 知道是誰在請求
```

---

### 🗄️ 資料庫設計

**學到的事：**
- **關聯式資料表**：`users`、`collection`、`wallet_transactions` 怎麼用外鍵（FK）連起來
- **RLS（Row Level Security）**：資料庫層的存取控制，不是只靠後端邏輯
- **Atomic Function（原子函式）**：把多步驟操作變成一個不可分割的交易，防止資料不一致
- **Database Trigger**：資料變動時自動執行的函式（稽核日誌）
- **Index（索引）**：加速查詢，`user_id` 這種常查的欄位要建 index

---

### ⚛️ 前端開發

**學到的事：**
- **React + Vite**：現代前端的標準工具鏈
- **Zustand**：簡單的全域狀態管理（比 Redux 輕很多）
- **Axios Interceptor**：在每個 HTTP 請求自動加 JWT token，不用每次手動加
- **TypeScript**：型別系統讓你在編譯時就能抓到錯誤，而不是等到運行時

---

### 🔒 資安觀念

**學到的事：**
- **Race Condition**（競態條件）：多個請求同時操作同一筆資料時的風險
- **Rate Limiting**（速率限制）：防止暴力嘗試和濫用
- **RLS / 最小權限原則**：每個角色只給它需要的最少權限
- **Audit Log**（稽核日誌）：所有重要操作都要留下可追溯的紀錄
- **服務密鑰 vs 匿名密鑰**：`service_key` 和 `anon_key` 的差別與使用場合

---

### 📊 數據追蹤

**學到的事：**
- **GA4 埋點**：怎麼把用戶行為轉成可分析的數據
- **事件追蹤設計**：追蹤什麼、不追蹤什麼（隱私）、參數怎麼命名
- **環境隔離**：本地開發和正式環境的 GA4 數據怎麼分開

---

### 🚀 部署

**學到的事：**
- **Vercel**：前端和後端都可以部署，`vercel.json` 控制路由
- **環境變數管理**：本地 `.env`、Vercel Dashboard、不同環境用不同值
- **Monorepo 結構**：一個 git repository 管理前台、後台、後端三個子專案

---

### 🧪 測試

**學到的事：**
- **TDD（測試驅動開發）**：先寫測試，再寫實作
- **Vitest**：Vite 原生的測試框架
- **Unit Test vs Integration Test**：單元測試測一個函式，整合測試測多個元件合在一起
- **Mock**：測試時假造外部依賴（如 `gtag`），讓測試可以獨立執行

---

### 💡 最重要的一個觀念

**後端永遠是防線，前端只是方便**

不管你的前端 UI 做得多完善、多難繞過，  
只要你的後端 API 沒有驗證、資料庫沒有保護，  
有心人士可以直接用 `curl` 或 `Postman` 跳過前端，直接打你的 API。

```
錯誤思路：「前端已經擋住了，應該沒問題」
正確思路：「前端擋住的只是一般用戶，後端要假設每個請求都可能是惡意的」
```

這也是為什麼這個專案把所有重要邏輯都放在後端和資料庫層，  
前端只負責顯示和發送請求，不做任何信任判斷。

---

*最後更新：2026-04-18*
*新增：十三（資安防竄改）、十四（專案學習回顧）*


---

## 十五、消費紀錄（功能 3）：URL state 實作

**Week 5 完成功能**

### URL State 設計

顧客點「消費紀錄」按鈕 → URL 變成 `/?tab=history` → 顯示交易明細。

```
URL 無 tab 參數 → 正常主畫面
/?tab=history   → 覆蓋式消費紀錄頁面
```

### 實作方式

**讀取 URL state（初始化時）：**

```typescript
// App.tsx
const [showHistory, setShowHistory] = useState(() => {
  const params = new URLSearchParams(window.location.search)
  return params.get('tab') === 'history'
})
```

**寫入 URL state（按鈕點擊）：**

```typescript
// FloatingSidebar 觸發
onHistoryClick={() => {
  setShowHistory(true)
  window.history.pushState({}, document.title, '/?tab=history')
}}

// 返回主頁
onClick={() => {
  setShowHistory(false)
  window.history.replaceState({}, document.title, '/')
}}
```

**為什麼用 `pushState` 而不是 `replaceState`？**

- `pushState`：新增一條歷史記錄，使用者按「上一頁」可返回
- `replaceState`：取代當前記錄，按「上一頁」直接離開 App
- 進入消費紀錄頁用 `push`，返回主頁用 `replace`（避免「上一頁」又回到 history）

### 新增的 GA4 追蹤

| 事件 | 觸發時機 |
|------|---------|
| `view_transaction_history` | 開啟消費紀錄頁時 |

---

## 十六、自動報表（功能 4）：資料聚合

**Week 6 完成功能**

### 報表架構

```
商家後台「報表」tab（📈）
    ↓ 選擇年/月 → 點「產生報表」
    ↓ GET /api/admin/reports/monthly?year=2026&month=4
    ↓ 後端並行查詢 6 個資料來源
    ↓ 回傳聚合結果
    ↓ 前端顯示四大區塊
```

### 後端並行查詢（`Promise.all`）

```javascript
const [ordersResult, totalUsersResult, newUsersResult,
       topupsResult, spendResult, inventoryResult] = await Promise.all([
  // 6 個 Supabase 查詢同時發出，而不是依序等待
  supabase.from('orders').select('*').gte(...).lte(...),
  supabase.from('users').select('id', { count: 'exact', head: true }),
  // ...
])
```

**為什麼用 `Promise.all`？**

- 6 個查詢互相獨立（不互相依賴）
- 依序執行：假設每個查詢 100ms → 總計 600ms
- 並行執行：最慢的那個查詢決定總時間 → 約 100-200ms

### 報表資料結構

```
{
  period: { year, month },
  sales: {
    totalOrders, totalRevenue, cashAmount, linePayAmount,
    cashCount, linePayCount, totalCups,
    topItems: [{ name, count }]  ← 依銷量排序
  },
  members: { totalUsers, newUsers },
  wallet: { totalTopups, totalTopupAmount, totalSpent },
  inventory: { lastRecord }
}
```

### TDD 流程回顧

本次使用嚴格 TDD：

```
1. 🔴 RED — 先寫 TransactionHistory.test.tsx + ReportsTab.test.tsx（測試全失敗）
2. 🟢 GREEN — 實作最小程式碼讓測試通過
3. 🔵 REFACTOR — 修正測試中的邊界問題（多個匹配元素）
```

**測試中遇到的問題：**

| 問題 | 原因 | 解法 |
|------|------|------|
| `getByText('現金儲值')` 找到多個 | mock 中兩筆交易都叫「現金儲值」 | 改用 `getAllByText('現金儲值')` 並驗證長度 |
| `getByText('拿鐵')` 找不到 | JSX `{num}. {name}` 在同一 span 產生多個 text node | 改找 `getByText('☕ 品項銷售排行')` 這個唯一標題 |
| `getByText(/拿鐵/)` 找到多個 | 正則也會匹配到父元素的 textContent | 避免在有子元素的容器上用正則 `getByText` |

*最後更新：2026-04-18*
*新增：十五（消費紀錄 URL state）、十六（自動報表資料聚合）*

---

## 十七、現金儲值功能（功能 2）：架構與規格

**Week 3-4 完成功能**

---

### 整體架構一覽

```
顧客手機（前台）                商家後台                   後端 API                    資料庫（Supabase）
─────────────────────────────────────────────────────────────────────────────────────────────────────
                          [管理員] 輸入金額
                          POST /api/admin/topup-qr/generate
                                  ↓ 產生 TOPUP-xxxxxxxx 代碼
                                  ↓ 寫入 topup_qr_codes（30min TTL）
                          [展示 QR Code 給顧客]
                                  ↓
[顧客掃描 QR Code]
POST /api/wallet/topup ──────────→ 驗證代碼格式（TOPUP- 前綴）
   { code: "TOPUP-xxx" }          呼叫 RPC topup_wallet()
                                  ├─ SELECT ... FOR UPDATE（鎖錢包列）
                                  ├─ 確認 QR 未使用 + 未過期
                                  ├─ UPDATE wallets（餘額加總）
                                  ├─ INSERT wallet_transactions（type=topup）
                                  └─ UPDATE topup_qr_codes（used=true）
                         ←──────── { success, amount, newBalance }
[顯示儲值成功 + 新餘額]
```

---

### 資料表設計（`database/add_wallet.sql`）

#### `wallets` — 用戶錢包（每人一筆）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | UUID | 主鍵 |
| `user_id` | UUID FK → users | 對應用戶（UNIQUE，一人一錢包） |
| `balance` | INTEGER | 餘額（`CHECK (balance >= 0)`，不可負） |
| `updated_at` | TIMESTAMPTZ | 最後異動時間 |

**設計重點：** `balance >= 0` 的 CHECK constraint 在資料庫層確保不超扣，即使後端邏輯有 bug 也不會讓餘額變負。

---

#### `wallet_transactions` — 交易明細

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | UUID | 主鍵 |
| `user_id` | UUID FK → users | 對應用戶 |
| `amount` | INTEGER | 金額（**正數** = 儲值，**負數** = 扣款） |
| `type` | TEXT | `'topup'` 或 `'deduct'` |
| `note` | TEXT | 顯示給用戶的說明（例：「冰拿鐵 $45」） |
| `order_ref` | TEXT | 關聯訂單編號（扣款時填入） |
| `created_at` | TIMESTAMPTZ | 建立時間 |

**設計重點：** `amount` 用正負號，前端只需顯示原始值——正數就加上 `+$`，負數就加上 `-$`，邏輯清晰。

---

#### `topup_qr_codes` — 儲值 QR Code（一次性）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | UUID | 主鍵 |
| `code` | TEXT UNIQUE | 儲值代碼（`TOPUP-` + 16 位亂數 hex） |
| `amount` | INTEGER | 儲值金額（`CHECK (amount > 0)`） |
| `used` | BOOLEAN | 是否已使用（預設 false） |
| `used_by` | UUID FK → users | 誰使用了這張 QR |
| `used_at` | TIMESTAMPTZ | 使用時間 |
| `expires_at` | TIMESTAMPTZ | 過期時間（生成後 30 分鐘） |
| `created_at` | TIMESTAMPTZ | 建立時間 |

**設計重點：** `UNIQUE` 在 code 欄位，讓資料庫層也能阻擋重複使用（雙重保護，除了應用層判斷外）。

---

#### `qr_codes` 新增欄位

```sql
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS wallet_amount INTEGER;
```

點單 QR Code 帶入 `wallet_amount`，前端掃碼後知道這筆訂單應扣多少儲值金。

---

### API 端點設計

| 端點 | 方法 | 權限 | 說明 |
|------|------|------|------|
| `/api/admin/topup-qr/generate` | POST | 管理員 JWT | 產生儲值 QR Code（TOPUP- 前綴） |
| `/api/wallet/topup` | POST | 用戶 JWT | 掃描儲值 QR → 自動入帳 |
| `/api/wallet/balance` | GET | 用戶 JWT | 查詢餘額 + 最近 20 筆交易 |

**W2 儲值 API 完整流程（`/api/wallet/topup`）：**

```
1. 驗證 JWT（authenticateToken 中間件）
2. 驗證速率：walletTopupLimiter（每分鐘 5 次）
3. 驗證 code 格式：必須以 TOPUP- 開頭（快速拒絕偽造請求）
4. 呼叫 Postgres RPC topup_wallet()（atomic）
   ├─ 鎖定 topup_qr_codes 列（FOR UPDATE）
   ├─ 檢查 used=false、expires_at > NOW()
   ├─ 鎖定 wallets 列（FOR UPDATE）
   ├─ UPDATE wallets SET balance = balance + amount
   ├─ INSERT wallet_transactions
   └─ UPDATE topup_qr_codes SET used=true, used_by, used_at
5. 回傳 { success, amount, newBalance }
```

---

### 前端元件架構

```
App.tsx
├── useWalletStore（Zustand store）
│   ├── balance: number
│   ├── loaded: boolean
│   ├── fetchBalance()      ← 登入後呼叫一次
│   └── setBalance()        ← 儲值/扣款後即時更新
│
├── WalletBalance.tsx        ← 顯示餘額小 chip（☕ 咖啡儲值金 $xxx）
│
├── WalletPaymentModal.tsx   ← 確認扣款彈窗
│   ├── 顯示：即將扣款 / 目前餘額 / 扣款後餘額
│   ├── 餘額不足時：按鈕 disabled + 警示文字
│   └── loading 狀態：按鈕顯示「處理中…」
│
└── TransactionHistory.tsx   ← 消費紀錄列表（via /?tab=history）
    ├── 呼叫 GET /api/wallet/balance 取得餘額 + 最近 20 筆交易
    └── 每筆交易顯示：note / 日期 / +$金額 or -$金額（顏色區分）
```

---

### 兩種 QR Code 的辨識方式

系統同時有兩種 QR Code，前端用前綴區分：

| 前綴 | 範例 | 用途 | 掃描後動作 |
|------|------|------|-----------|
| `COFFEE-` | `COFFEE-A1B2C3D4E5F6` | 點單 QR（抽卡） | 呼叫 claim_order_qr → 抽卡 |
| `TOPUP-` | `TOPUP-FF3A9B72CCDE0145` | 儲值 QR | 呼叫 topup_wallet → 餘額增加 |

```typescript
// App.tsx 中的 QR Code 路由邏輯
if (qrCode.startsWith('TOPUP-')) {
  // 儲值流程
  await walletAPI.topup(qrCode)
} else if (qrCode.startsWith('COFFEE-')) {
  // 點單/抽卡流程
  await api.claimQR(qrCode)
}
```

**為什麼用前綴而不是後端判斷？**  
前端能在第一時間顯示正確 UI（儲值確認 vs 抽卡動畫），不需要等後端回應才知道要顯示什麼畫面。

---

## 十八、資安深入學習：金流系統的四道防線

> 本章是十三章「防竄改系統」的深度補充，從「為什麼會有這個問題」開始說起。

---

### 防線一：代碼前綴驗證（最快的拒絕）

**問題：** 有人可以隨意猜測或構造請求嗎？

```javascript
// 後端第一道檢查——格式錯就立刻回絕，不進資料庫
if (!code || typeof code !== 'string' || !code.startsWith('TOPUP-')) {
  return res.status(400).json({ success: false, message: '無效的儲值代碼' });
}
```

**概念：Fail Fast（快速失敗）**

不等到查資料庫才發現格式錯，在最前面就擋掉——
節省資料庫資源，也讓攻擊者的惡意請求「代價更高」（每次請求都被快速拒絕）。

---

### 防線二：Atomic Transaction（原子交易）

**問題：** 為什麼不能用「先查詢，再更新」？

```
❌ 有問題的流程：
1. 查詢 QR Code → 「未使用」
   （此時第 2 個請求也查詢 → 也看到「未使用」）
2. 扣款 / 儲值
   （第 2 個請求也扣款 → 雙重入帳！）
3. 標記已使用
   （已經太晚了）

✅ 正確的流程（Atomic）：
RPC topup_wallet() 內部：
  ├─ BEGIN TRANSACTION
  ├─ SELECT ... FOR UPDATE（鎖住這一列，其他請求等待）
  ├─ 確認 used=false、未過期
  ├─ UPDATE（改餘額、標記使用）
  ├─ INSERT（寫入交易記錄）
  └─ COMMIT（一次性完成，鎖釋放）
```

**概念：ACID 中的 Atomicity**

資料庫交易的基本性質：
- **A**tomicity（原子性）：全部成功或全部失敗，不可能只執行一半
- **C**onsistency（一致性）：交易前後資料都符合規則（balance >= 0）
- **I**solation（隔離性）：`FOR UPDATE` 讓並發請求排隊，不互相干擾
- **D**urability（持久性）：COMMIT 後資料一定寫入，不會因系統崩潰丟失

---

### 防線三：SECURITY DEFINER（身分提升函式）

**問題：** RLS 限制了普通用戶只能讀自己的資料，但 RPC 函式需要修改多個資料表怎麼辦？

```sql
CREATE OR REPLACE FUNCTION deduct_wallet(...)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
-- 這個函式以「資料庫擁有者」的身分執行
-- 可以繞過 RLS，但外部用戶無法直接操作資料
$$;
```

**比喻：超市的員工通道**

- 一般顧客（用戶）→ 只能走「結帳通道」（RLS 限制只能讀自己資料）
- 員工通道（SECURITY DEFINER 函式）→ 員工才能走，但顧客可以「請員工去拿商品」
- 員工的行為有明確規範（函式邏輯），不能亂拿

**關鍵點：** 用戶無法直接執行 SQL，只能呼叫後端 API → API 呼叫 RPC 函式 → RPC 以 DEFINER 身分執行。外部攻擊者無法繞過這個流程。

---

### 防線四：RLS + 最小權限原則

**問題：** 前端 JS 如果 bundle 被看到 Supabase API key，會怎樣？

```
專案的設計決策：前端完全不使用 Supabase client
                 ↓
所有請求都走後端 API
                 ↓
後端用 service_role key（管理員金鑰，伺服器端保存，不暴露）
                 ↓
前端只有後端的 API URL，沒有資料庫憑證
```

**Supabase 兩種 Key 的差別：**

| Key 類型 | 可見範圍 | 權限 | 何時用 |
|---------|---------|------|--------|
| `anon key` | 可以暴露在前端 | 受 RLS 限制 | 前端直連 Supabase 時用 |
| `service_role key` | **絕對不能暴露** | 繞過所有 RLS | 後端伺服器端使用 |

**本專案選擇後端代理模式的原因：**
- 商業邏輯（抽卡機率、儲值驗證）不能在前端暴露
- 金流操作必須有後端審計
- 統一在後端做輸入驗證，不依賴前端

---

### 防線對照表

| 攻擊場景 | 防禦機制 | 實作位置 |
|---------|---------|---------|
| 偽造儲值代碼 | 前綴驗證 + UUID 亂數（128 bits） | `server-supabase.js` |
| 同一 QR 雙重掃描 | FOR UPDATE 鎖 + used=true | `topup_wallet()` RPC |
| 暴力猜測代碼 | Rate Limiting（5次/分鐘） | `walletTopupLimiter` |
| 前端繞過跳直連 DB | RLS + 無 anon key 暴露 | `add_wallet.sql` |
| 後端邏輯 bug 超扣 | `CHECK (balance >= 0)` constraint | `wallets` table |
| 操作不留記錄 | wallet_transactions 強制寫入 | RPC 內的 INSERT |
| 代碼永久有效 | `expires_at`（30 分鐘 TTL） | topup_qr_codes |

---

### 學到的資安原則總結

| 原則 | 說明 | 本專案對應 |
|------|------|-----------|
| **Defense in Depth（縱深防禦）** | 不依賴單一防線，每層都要防 | 7 道防線互相補強 |
| **Fail Fast** | 格式錯誤在最前面擋掉，不進後面邏輯 | 前綴驗證、整數驗證 |
| **Least Privilege（最小權限）** | 每個角色只給它需要的最少權限 | RLS、service key 後端專用 |
| **Immutable Audit Log** | 資料變動一定留下不可修改的紀錄 | wallet_transactions |
| **ACID Transactions** | 金融操作必須保證原子性與隔離性 | FOR UPDATE + COMMIT |
| **Never Trust Client** | 後端假設所有前端輸入都可能是惡意的 | 後端完整驗證輸入 |

---

*最後更新：2026-04-25*
*新增：十七（現金儲值架構與規格）、十八（金流系統資安四道防線）*

---

## 十九、產品經理視角：儲值金功能的完整 Scrum 框架

> 同一個功能，工程師看的是「怎麼做」，PM 看的是「為什麼做」、「做到什麼算完成」、「做完後有沒有達到目標」。

---

### 對應關係總覽

| Scrum 環節 | 技術語言 | PM 語言 |
|-----------|---------|---------|
| Sprint Planning | 決定這次 sprint 做什麼 | 解決什麼用戶痛點？值得做嗎？ |
| Backlog Refinement | 分析需求邏輯與可行性 | 這個解法合理嗎？有沒有更簡單的路？ |
| Definition of Ready | 架構與規格確立 | 開發者動工前，需求夠清楚嗎？ |
| Prototype / Increment | 原型與設計稿 | 用戶拿到手會懂怎麼用嗎？ |
| Sprint Review / Retro | 評估成果、修正方向 | 解決問題了嗎？下一步要改什麼？ |

---

### 1. Sprint Planning — 規劃：為什麼要做這個功能？

**背景問題（問題定義）**

| 痛點 | 誰受影響 | 嚴重程度 |
|------|---------|---------|
| LINE Pay 要加好友才能轉帳，收款人不固定 | 顧客（每次換人都要重加） + 店員（要先秀出自己 LINE）| 🔴 高 |
| 忘帶現金 / 沒零錢 | 顧客 | 🟡 中 |
| 收款後對帳麻煩 | 店長 | 🟡 中 |

**解法比較（Why 儲值金 > 其他方案）**

| 方案 | 優點 | 缺點 | 選擇？ |
|-----|------|------|--------|
| 繼續用現金 | 零技術成本 | 痛點未解，找零慢 | ❌ |
| 統一一個 LINE Pay QR Code | 部分解決加好友問題 | 對帳仍麻煩，無記錄 | ❌ |
| 第三方支付（街口、悠遊付） | 成熟產品 | 需申請商家帳號、審核期長、手續費 | ❌ |
| **自建儲值金系統** | 一次儲值、多次扣款、自動留記錄 | 需開發、需資安把關 | ✅ |
| 寄杯功能 | 類似概念 | 綁定品項、介面複雜、需庫存管理 | ❌ |

**選擇儲值金的核心理由：**  
在社團這個「熟客為主、信任度高」的環境，儲值不需要複雜的退款機制，操作流程最簡單——一次儲、多次扣、餘額透明。

---

### 2. Backlog Refinement — 流程與分析：解法可行嗎？

**User Story（使用者故事）**

```
身為 常客顧客（Carol）
我想要 預先儲值，之後每次買咖啡直接扣款
以便 不用帶現金，也不用每次和不同店員換 LINE

身為 店員（Alice）
我想要 幫顧客快速完成儲值，也可以幫顧客快速扣款
也不用跳出畫面使用第三方 App 來做掃描 qrcode 加好友或去 line 確認收款，增加收款速度 

身為 店長
我想要 在月報看到儲值金的總入帳與消費金額
以便 了解儲值金的使用狀況，評估是否推廣
```

**需求澄清（Refinement 時要問的問題）**

| 問題 | 決策結果 |
|------|---------|
| 儲值金額有最低限額嗎？ | 無，任意整數，由店員輸入 |
| 可以退款嗎？ | 不行，只可轉讓儲值金 |
| 餘額不足時要怎麼處理？ | 禁止扣款，前端顯示「餘額不足」，引導去門市儲值 |
| 儲值 QR 有效期限多長？ | 30 分鐘（現場操作，不需要更長） |
| 顧客可以自己儲值嗎？ | 不行，必須給現金給店員，由店員在後台操作 |

**邊界案例（Edge Cases）**

```
Q: 顧客掃 QR Code 當下餘額夠，但確認前餘額被另一筆扣款花掉了？
A: 後端 FOR UPDATE 鎖確保扣款 atomic，不會發生餘額中途消失的情況。

Q: 店員誤輸入儲值金額，可以撤銷嗎？
A: 本期無撤銷功能，店員輸入前需再次確認。（未來可加「管理員手動調整」）

Q: QR Code 過期後，顧客才掃描怎麼辦？
A: 後端驗證 expires_at，回傳「儲值代碼已過期」，店員重新產生一張即可。
```

---

### 3. Definition of Ready — 架構與規格：開發前要確認什麼？

**Acceptance Criteria（驗收標準）**

這是 PM 最重要的產出：開發完成後，如何判斷「做完了」？

```
✅ 店員可以在後台輸入金額，產生一張有 30 分鐘效期的儲值 QR
✅ 顧客用手機掃描 QR 後，餘額自動增加對應金額
✅ 同一張儲值 QR 只能使用一次（掃第二次要顯示錯誤）
✅ 顧客在前台可以看到目前的儲值金餘額
✅ 點單時可以選擇「咖啡儲值金」付款，確認前顯示扣款明細
✅ 餘額不足時，付款按鈕要 disabled，並顯示提示文字
✅ 所有儲值與扣款動作都記錄在交易明細，顧客可查詢
✅ 月報要包含當月儲值總額與消費總額
```

**業務規則（Business Rules）**

```
儲值金額：正整數，無上下限
扣款時機：顧客確認彈窗點「確認付款」後即時扣款
最小精度：整數元（無零錢）
幣別：新台幣（不顯示幣別符號，用 $ 即可）
帳號綁定：一個 LINE 帳號對應一個錢包
退款政策：無，只有轉讓儲值金功能
```

**範圍界定（In Scope / Out of Scope）**

| In Scope ✅ | Out of Scope ❌（本期不做）|
|------------|--------------------------|
| 儲值（店員幫顧客操作） | 顧客自助儲值 |
| 掃碼扣款 | 線上支付串接 |
| 餘額顯示 | 餘額轉讓 |
| 交易明細（最近 20 筆） | 完整歷史查詢（分頁） |
| 月報顯示儲值金統計 | 儲值金報表獨立匯出 |

---

### 4. Prototype / Increment — 使用者要求條件：設計給用戶看得懂

**顧客端 UX Flow（前台）**

```
[前台首頁]
    ↓ 登入後
[☕ 咖啡儲值金 $200] ← WalletBalance chip（隨時可見餘額）
    ↓ 掃描儲值 QR Code
[儲值成功！+ $200，目前餘額 $200] ← 成功提示

[掃描點單 QR Code → 出現付款確認彈窗]
┌────────────────────┐
│ 確認使用儲值金付款  │
│                    │
│ 即將扣款    $45    │  ← 紅色
│ 目前餘額   $200    │
│ ─────────────────  │
│ 扣款後餘額 $155    │  ← 綠色
│                    │
│  [取消]  [確認付款] │
└────────────────────┘
    ↓ 確認後
[扣款成功，抽卡！]
```

**設計決策說明（PM 需要能解釋的）**

| 設計選擇 | 為什麼這樣做 |
|---------|------------|
| 餘額顯示為小 chip，不佔版面 | 社團氛圍輕鬆，不想讓 App 太像「金融產品」 |
| 扣款確認彈窗顯示三個數字 | 預防顧客不知道扣多少、剩多少，減少糾紛 |
| 餘額不足時按鈕 disabled | 防止顧客點了才發現失敗（減少挫折感） |
| 儲值由店員操作而非顧客自助 | 現金交接需要人工確認，不適合全自動 |
| QR Code 30 分鐘效期 | 夠長讓店員找到顧客，夠短讓代碼不被截圖濫用 |

---

### 5. Sprint Review / Retro — 評估與解決方案：做完了，然後呢？

**Sprint Review — 驗收問題**

```
✅ 功能完成了嗎？（對照 Acceptance Criteria）
✅ 用戶實際用了嗎？（看 GA4 topup_complete 事件數）
✅ 有沒有出現邊界問題？（QR 過期、餘額不足的 error 日誌）
```

**Retro — 這次做得好 / 可以更好**

| 類別 | 發現 |
|------|------|
| ✅ 做得好 | 先定 Acceptance Criteria 再開發，驗收明確不模糊 |
| ✅ 做得好 | 邊界案例（過期 QR、餘額不足）都事先討論好，開發中沒有臨時決策 |
| 🔄 可以更好 | 儲值 QR 在後台應顯示「已使用」狀態，目前店員無法確認是否入帳 |
| 🔄 可以更好 | 缺乏退款流程，萬一店員輸錯金額無法修正 |
| ⏳ 下一步考慮 | 顧客端加入「儲值」按鈕入口（目前入口不夠直覺） |

**待解問題（Backlog 新增項目）**

```
📌 後台儲值完成後，該張 QR Code 是否要即時顯示「已使用」狀態？
   現況：後台只顯示「已生成」，不知道顧客是否已掃
   影響：店員無法確認入帳，可能重複幫顧客產生 QR
   建議：在後台儲值 QR 列表加上「已使用 / 未使用 / 已過期」狀態標記
```

---

### PM vs 工程師：看同一個功能的不同視角

| 視角 | 「儲值 QR 只能用一次」對他們的意義 |
|------|----------------------------------|
| **PM** | 防止顧客重複入帳，保護公司財務；用戶體驗：用過就失效，清晰不混亂 |
| **工程師** | `SELECT ... FOR UPDATE` + `used=true` 的 atomic 操作 |
| **資安** | 消滅 race condition，防止雙重使用攻擊 |

三個視角說的是同一件事，只是從不同維度理解同一個需求。  
PM 的工作是讓這三個視角能互相對話，不是三個人各說各話。

---

*最後更新：2026-04-25*
*新增：十九（PM 視角 Scrum 框架）*


記錄問題:
1. 後台儲值完，用戶入帳已確認，後台該 qrcode 是否要直接跳出已被使用狀態?