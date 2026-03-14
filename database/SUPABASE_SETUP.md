# Supabase 設定指南

## 1. 建立 Supabase 專案

1. 前往 [Supabase](https://supabase.com/) 並註冊/登入
2. 點擊 "New Project"
3. 輸入專案名稱：`coffee-map-game`
4. 設定資料庫密碼（請記住此密碼）
5. 選擇區域：建議選擇 `Singapore (Southeast Asia)` 以獲得較低延遲
6. 點擊 "Create new project" 並等待約 2 分鐘

## 2. 取得 API 金鑰

1. 在專案儀表板中，點擊左側選單的 "Settings" > "API"
2. 記錄以下資訊：
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

## 3. 建立資料庫結構

1. 點擊左側選單的 "SQL Editor"
2. 點擊 "+ New query"
3. 複製 `database/schema.sql` 的完整內容
4. 貼上到編輯器並點擊 "Run"
5. 確認顯示 "Success. No rows returned" 或類似訊息

## 4. 驗證表格建立

1. 點擊左側選單的 "Table Editor"
2. 確認以下表格已建立：
   - ✅ users
   - ✅ collection
   - ✅ gacha_history
   - ✅ qr_codes
   - ✅ shares

## 5. 設定環境變數

### 前端設定（frontend/.env）

複製 `frontend/.env.example` 為 `frontend/.env`，並填入：

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_LINE_CLIENT_ID=你的LINE_CHANNEL_ID
VITE_API_URL=http://localhost:3000/api
```

### 後端設定（.env）

更新現有的 `.env` 檔案，新增 Supabase 設定：

```env
NODE_ENV=development
PORT=3001
JWT_SECRET=your_jwt_secret_here
LINE_CHANNEL_ID=your_line_channel_id
LINE_CHANNEL_SECRET=your_line_channel_secret
ADMIN_TOKEN=your_admin_token

# 新增 Supabase 設定
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=你的_service_role_key_here
```

> ⚠️ **重要**: `SUPABASE_SERVICE_KEY` 使用 "service_role" key，不是 "anon" key  
> 在 Supabase Dashboard > Settings > API > "service_role" 中找到

## 6. 測試連線

### 前端測試

```bash
cd frontend
npm run dev
```

開啟 http://localhost:3000，檢查瀏覽器 Console 是否有錯誤。

### 後端測試

```bash
node server.js
```

確認伺服器正常啟動，沒有資料庫連線錯誤。

## 7. 常見問題

### Q: Row Level Security 錯誤
A: 確認已執行 schema.sql 中的 RLS 政策。如果仍有問題，可以暫時停用 RLS：
```sql
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
```

### Q: API 回應 401 Unauthorized
A: 檢查 `SUPABASE_ANON_KEY` 是否正確，確認已複製完整的 key。

### Q: 無法插入資料
A: 檢查 RLS 政策是否正確設定。開發階段可暫時使用 `service_role` key。

## 8. 下一步

完成設定後，您可以：
1. 測試 LINE Login 功能
2. 測試 QR Code 掃描
3. 測試抽卡機制
4. 部署到正式環境
