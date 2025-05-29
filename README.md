# QR Code 多功能工具

## 🎯 功能概述

使用 Remix + TypeScript + Tailwind CSS 建構的現代化 QR Code 工具，包含：
- **自動生成功能**：每2秒自動產生包含毫秒時間戳的 QR Code
- **智能掃描功能**：使用相機自動掃描 QR Code 並驗證時效性
- **時間差距檢測**：掃描時檢查 QR Code 的新鮮度（5秒內有效）
- **資料庫儲存**：自動儲存有效的掃描結果

## ✨ 主要特色

### 自動生成 QR Code
- **時間戳內容**：每個 QR Code 包含毫秒級時間戳
- **自動更新**：每2秒自動產生新的 QR Code
- **即時顯示**：顯示生成時間（台灣時區）
- **手動控制**：可隨時手動產生新的 QR Code

### 智能掃描系統
- **自動啟動**：進入掃描頁面自動開始掃描
- **時效檢查**：只儲存5秒內產生的 QR Code
- **即時回饋**：顯示掃描狀態和時間差距
- **詳細日誌**：完整的掃描過程記錄

### 時間格式化
```typescript
// QR Code 內容：毫秒時間戳
1732879825123

// 顯示格式：台灣時區
2024/05/29 14:30:25
```

## 🚀 快速開始

### 環境設定
```bash
# 安裝依賴
npm install

# 設定環境變數
cp .env.example .env
# 編輯 .env 檔案，設定 DATABASE_URL

# 啟動開發伺服器
npm run dev
```

### 資料庫設定
確保您的 PostgreSQL 資料庫包含以下表結構：
```sql
CREATE TABLE IF NOT EXISTS scanned_data (
  id SERIAL PRIMARY KEY,
  data TEXT NOT NULL,
  scanned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## 📱 使用方式

### 產生 QR Code
1. 前往 `/generate` 頁面
2. QR Code 會自動每2秒更新一次
3. 可點擊「手動生成新的 QR Code」立即產生
4. 複製時間戳或保存 QR Code 圖片

### 掃描 QR Code
1. 前往 `/scan` 頁面（會自動開始掃描）
2. 將 QR Code 對準相機鏡頭
3. 系統會自動檢測並驗證時效性
4. 有效的 QR Code 會自動儲存到資料庫

## 🔧 技術架構

### 前端技術
- **Remix** - 全端 React 框架
- **TypeScript** - 類型安全的 JavaScript
- **Tailwind CSS** - 現代化 CSS 框架
- **QRCode.js** - QR Code 生成庫
- **jsQR** - QR Code 解析庫

### 後端技術
- **Node.js** - JavaScript 執行環境
- **PostgreSQL** - 關聯式資料庫
- **pg** - PostgreSQL 客戶端

### 核心功能實作

#### 時間戳生成
```typescript
const timestamp = Date.now().toString(); // 毫秒時間戳
const qrCode = await QRCode.toDataURL(timestamp, {
  errorCorrectionLevel: 'H',
  width: 256,
  margin: 2,
});
```

#### 自動掃描循環
```typescript
const tick = () => {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height);
  if (code && code.data) {
    handleScannedData(code.data);
  }
  requestAnimationFrame(tick);
};
```

#### 時效性驗證
```typescript
const qrCodeTime = new Date(parseInt(scannedData));
const timeDifference = scanTime.getTime() - qrCodeTime.getTime();
const isValid = timeDifference <= 5000; // 5秒內有效
```

## 🗂️ 架構簡化

此版本已移除不必要的複雜功能：
- 移除 WebSocket 功能（改用簡單的客戶端計時器）
- 移除 Server-Sent Events
- 移除 API 輪詢機制
- 使用純客戶端 QR Code 生成，提升效能

## 📁 專案結構

```
app/
├── components/
│   └── QrScanner.tsx          # QR Code 掃描組件
├── routes/
│   ├── _index.tsx            # 首頁
│   ├── generate.tsx          # QR Code 生成頁面
│   └── scan.tsx              # QR Code 掃描頁面
├── entry.client.tsx          # 客戶端進入點
├── entry.server.tsx          # 伺服器進入點
├── root.tsx                  # 根組件
└── tailwind.css              # 樣式檔案
```

## 🎨 UI/UX 設計

### 視覺特色
- **深色主題**：現代化的深灰色調配色
- **漸層效果**：美觀的漸層背景和按鈕
- **狀態指示**：清楚的視覺回饋系統
- **響應式設計**：適配各種螢幕尺寸

### 用戶體驗
- **自動化操作**：減少手動操作需求
- **即時回饋**：即時顯示操作狀態
- **錯誤處理**：友善的錯誤訊息顯示
- **無縫導航**：流暢的頁面切換體驗

## 🔍 除錯功能

### 掃描器日誌
- 即時顯示掃描過程
- 詳細的時間戳記錄
- 錯誤訊息追蹤
- 資料庫操作狀態

### 開發者工具
```typescript
// 啟用除錯模式
const [debugMessages, setDebugMessages] = useState<string[]>([]);
const addDebugMessage = (message: string, isError = false) => {
  console.log(`[SCANNER] ${message}`);
  // 添加到 UI 日誌顯示
};
```

## 🚦 效能優化

### 客戶端優化
- 使用 `requestAnimationFrame` 處理掃描循環
- 適當的元件清理防止記憶體洩漏
- 計時器精確控制避免重複請求

### 伺服器端優化
- 資料庫連接池管理
- 適當的錯誤處理和日誌記錄
- 環境變數配置管理

## 📦 部署指南

### 環境變數設定
```env
DATABASE_URL=postgresql://username:password@localhost:5432/database
NODE_ENV=production
PORT=3000
```

### 建構和部署
```bash
# 建構專案
npm run build

# 啟動生產伺服器（使用內建 Remix 伺服器）
npm start

# 或使用開發模式
npm run dev
```

## 🤝 貢獻指南

1. Fork 本專案
2. 建立功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交變更 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 開啟 Pull Request

## 📄 授權條款

本專案採用 MIT 授權條款 - 詳見 [LICENSE](LICENSE) 檔案

## 🙏 致謝

- [Remix](https://remix.run) - 優秀的全端 React 框架
- [Tailwind CSS](https://tailwindcss.com) - 實用的 CSS 框架
- [QRCode.js](https://github.com/soldair/node-qrcode) - QR Code 生成庫
- [jsQR](https://github.com/cozmo/jsQR) - QR Code 解析庫

---

**立即體驗這個現代化的 QR Code 工具，享受自動生成和智能掃描的便利功能！**