# ☕ 咖啡地圖收集遊戲

掃描店家 QR Code，收集世界各地咖啡產地卡片的互動式遊戲。

---

## 專案架構

```
coffee-map-game/
├── frontend/          # 玩家前台：React + Vite + TypeScript
├── backend/           # API 伺服器：Express.js + Supabase
├── merchant/          # 商家後台：React + Vite + TypeScript
└── database/          # SQL migration 腳本
```

### 技術棧

| 層級 | 技術 |
|------|------|
| 前台 UI | React 19, Vite, TypeScript, Framer Motion |
| 商家後台 | React 18, Vite, TypeScript, qrcode.react |
| 後端 API | Node.js, Express.js |
| 資料庫 | Supabase (PostgreSQL) |
| 登入驗證 | LINE Login (OAuth 2.0) |
| 部署 | Vercel（前台＋商家後台）、Railway（後端） |

---

## 功能說明

### 玩家前台（`frontend/`）
- LINE 登入
- 掃描 QR Code 或手動輸入代碼抽卡
- 抽卡動畫（三階段：翻轉 → 展示 → 收入寶箱）
- 世界地圖圖鑑（支援雙指縮放），顯示各咖啡產地卡片
- 卡片分享功能

### 商家後台（`merchant/`）
- LINE 登入 + 工作人員密碼兩步驟驗證
- 點單系統（從 `menu.json` 讀取菜單）
- 依點單杯數生成對應數量 QR Code
- 獨立抽卡 QR Code 管理（含已使用偵測輪詢）
- 統計數據：用戶數、抽卡次數、QR 使用率、點單紀錄

### 後端 API（`backend/`）
- `server.js`：In-memory 版本（本地開發用）
- `server-supabase.js`：Supabase 版本（正式部署用）

---

## Port 配置

| 服務 | Port |
|------|------|
| 前台（Vite dev） | `3000` |
| 商家後台（Vite dev） | `5501` |
| 後端 API | `3001`（本地）/ `process.env.PORT`（部署） |

---

## 本地開發

### 1. 後端

```bash
cd backend
npm install
```

建立 `backend/.env`：

```env
PORT=3001
JWT_SECRET=your-secret-key
LINE_CHANNEL_ID=your-line-channel-id
LINE_CHANNEL_SECRET=your-line-channel-secret
ADMIN_TOKEN=your-admin-password
FRONTEND_URL=http://localhost:3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

啟動（擇一）：
```bash
node server.js           # In-memory，不需 Supabase
node server-supabase.js  # 正式版，需 Supabase
```

### 2. 玩家前台

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
# → http://192.168.x.x:3000（區網手機測試）
```

### 3. 商家後台

```bash
cd merchant
npm install
npm run dev
# → http://localhost:5501
```

---

## 環境變數

### `frontend/.env`（選填，無此檔會自動偵測）

```env
VITE_API_URL=https://your-backend.railway.app/api
```

> 本地不需設定，程式會自動判斷：
> - `localhost` → `http://localhost:3001/api`
> - 區網 IP → `http://192.168.x.x:3001/api`
> - 有 `VITE_API_URL` → 使用該值（部署用）

---

## LINE Login 設定

1. 前往 [LINE Developers Console](https://developers.line.biz/)
2. 建立或選擇 Channel → LINE Login
3. **Callback URL** 加入以下（每行一個）：

```
http://localhost:3000/
http://localhost:5501/
https://your-frontend.vercel.app/
https://your-merchant.vercel.app/
```

4. 複製 **Channel ID** 與 **Channel Secret** 填入 `.env`

---

## Supabase 設定

執行 `database/` 目錄下的 SQL migration，建立以下資料表：
- `users`
- `qr_codes`
- `gacha_records`
- `share_tokens`
- `orders`（`backend/migrations/create_orders_table.sql`）

---

## 部署

### 後端 → Railway

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Root Directory：`backend`
3. Start Command：`node server-supabase.js`
4. 設定環境變數（同上 `.env` 內容，`PORT` 由 Railway 自動注入）
5. 取得部署網址，例如：`https://coffee-backend.up.railway.app`

### 前台 → Vercel

1. [vercel.com](https://vercel.com) → New Project → Import GitHub repo
2. Root Directory：`frontend`
3. 環境變數：
   ```
   VITE_API_URL=https://coffee-backend.up.railway.app/api
   ```

### 商家後台 → Vercel

1. 同上，Root Directory 改為 `merchant`
2. 環境變數：（`api.ts` 已寫死生產網址，部署前記得更新）

### 部署後更新

- Railway 環境變數 `FRONTEND_URL` 改為 Vercel 前台網址
- LINE Developers Console 加入正式 Callback URL

---

## 卡片資料

12 張咖啡產地卡，稀有度：

| 稀有度 | 卡片 |
|--------|------|
| SSR | 藝妓（巴拿馬）、藍山（牙買加）|
| SR | 耶加雪菲（衣索比亞）、柯納（夏威夷）、肯亞 AA |
| R | 哥倫比亞、瓜地馬拉、曼特寧（印尼）、哥斯大黎加 |
| N | 巴西、越南、坦尚尼亞 |

卡片圖片存放於 `frontend/public/item-1.jpg` ～ `item-12.jpg`
