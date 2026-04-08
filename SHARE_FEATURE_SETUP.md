# 分享功能設置指南

## 功能改進

### 1️⃣ Web Share API 支援
- 前端分享現在使用原生 **Web Share API**
- 用戶點擊「分享到」時，會顯示系統分享對話框
- 支援分享到：LINE、Facebook、訊息、WhatsApp、AirDrop 等多個應用
- 不支援的瀏覽器會自動降級為「複製連結」功能

### 2️⃣ 分享連結修復
- 分享連結現在正確指向**前端應用** URL
- 之前的問題：連結指向後端，導致 "cannot/agents" 錯誤
- 現在：分享連結使用 `FRONTEND_URL` 環境變數

---

## 環境設置（重要 🔴）

### 本地開發
```bash
# 後端 .env (backend 目錄)
FRONTEND_URL=http://localhost:5173
```

### Vercel 部署

#### 1. 後端設置（後端 Vercel 項目）
在 Vercel Dashboard 新增環境變數：
```
FRONTEND_URL=https://your-frontend-app.vercel.app
```

例如：
```
FRONTEND_URL=https://coffee-map-frontend.vercel.app
```

#### 2. 前端設置（前端 Vercel 項目）
確保前端部署後的 URL 被設置在後端環境變數中

---

## 測試分享功能

### 步驟
1. 進入遊戲並抽到有重複的卡片（數量 > 1）
2. 點擊右下方的「分享」按鈕（🎫）
3. 選擇要分享的卡片
4. 根據系統提示選擇分享方式
5. 在 LINE 或訊息中貼上連結，讓好友領取

### 環境要求
- iOS/Android：所有瀏覽器都支援原生分享
- Desktop (Mac)：Safari、Chrome 支援（可分享到 AirDrop）
- Desktop (Windows/Linux)：部分瀏覽器支援（降級為複製連結）

---

## 如何驗證 FRONTEND_URL 設置正確

### 方法 1：檢查生成的分享連結
1. 後端日誌中應看到類似：
   ```
   Share URL: https://your-frontend-app.vercel.app/?share=xxxxx
   ```

2. 點擊連結應該導向前端應用，而非「cannot/agents」頁面

### 方法 2：使用開發者工具
1. 打開瀏覽器開發者工具（F12）
2. 點擊分享按鈕
3. 在 Network 標籤查看 `/api/share/create` 響應
4. 確認 `shareUrl` 欄位指向正確的前端 URL

---

## 代碼修改摘要

### 前端 (ShareButton.tsx)
- ❌ 舊方式：複製連結到剪貼簿 (`navigator.clipboard.writeText()`)
- ✅ 新方式：使用 Web Share API (`navigator.share()`)
- 降級：不支援 Web Share API 的環境自動改用複製連結

### 後端 (server-supabase.js)
- ❌ 舊方式：`${req.protocol}://${req.get('host')}/?share=...` (指向後端)
- ✅ 新方式：`${FRONTEND_URL}/?share=...` (指向前端)

---

## 常見問題

### Q: 分享後用戶點進連結出現「cannot/agents」
**A:** 這表示 `FRONTEND_URL` 環境變數沒有正確配置。請確保：
1. 後端環境變數 `FRONTEND_URL` 已設置
2. URL 格式正確（不要加 `/api` 或其他路徑）
3. Vercel 重新部署後才會生效

### Q: 為什麼 iOS 上看不到分享對話框
**A:** 確認：
1. 瀏覽器支援 Web Share API（Safari、Chrome 都支援）
2. 分享連結已正確生成
3. 頁面通過 HTTPS 訪問（必需）

### Q: 能否自訂分享的訊息內容
**A:** 可以。在 `ShareButton.tsx` 的 `navigator.share()` 中修改：
```typescript
await navigator.share({
  title: '自訂標題',
  text: '自訂分享文案',
  url: shareUrl,
});
```

---

## 部署檢查清單

- [ ] 前端應用已部署到 Vercel，記下 URL
- [ ] 後端環境變數 `FRONTEND_URL` 已設置為前端 URL
- [ ] 後端已重新部署（Git push 觸發 Vercel 重新構建）
- [ ] 測試：生成分享連結，驗證 URL 正確
- [ ] 測試：在行動設備上點擊分享，選擇分享應用
- [ ] 測試：被領取者收到卡片，收藏更新

---

**最後更新：2026-04-04**
