# Coffee Map Game

這是一個全端應用程式，包含後端 API 和 前端介面。

## 專案結構

```
coffee-map-game/
├── frontend/           # React + Vite 前端應用
├── backend/            # Express + Supabase 後端 API
└── database/           # 資料庫相關文件與 SQL
```

## 快速開始

### 1. 啟動後端

```bash
cd backend
npm run dev
```
後端將運行於: http://localhost:3001 (API)
店家後台: http://localhost:3001/admin-qr.html (生成店家專屬 QR Code)

### 2. 啟動前端

```bash
cd frontend
npm run dev
```
前端將運行於: http://localhost:3000 

## Port 配置說明

- **後端 API**: Port `3001` (在 `.env` 中設定)
- **前端開發**: Port `3000` 
- **API 連線**: 前端透過 `VITE_API_URL=http://localhost:3001/api` 連接後端

## 環境變數

請確保 `backend/.env` 包含正確的 Supabase 設定。

104-portfolio