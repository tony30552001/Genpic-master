# 執行細節 (Execution Details)

> 版本 v1.0 | 最後更新：2026-02-10

---

## Phase 0 — 前端基礎重構

### 範圍與原則
- 僅重構前端結構，不改變任何業務流程與 API 行為
- Firebase 與 Vertex AI SDK 僅在 Phase 0 作為過渡依賴，Phase 1 開始清除
- 每一步驟完成後需可 demo，且可在 5 分鐘內回退

### 工作分解（WBS）
- Step 0.1：安裝 shadcn/ui 核心元件 + 建立目錄結構
- Step 0.2：拆分 `InfographicGenerator.jsx` 為 layout/create/styles/history 元件
- Step 0.3：建立 `services/` 與 `hooks/`，移除 UI 直接 import Firebase SDK
- Step 0.4：加入路由與錯誤邊界，補齊最小品質基線

### 定義完成 (Definition of Done)
- 主頁 `/`、`/styles`、`/history` 可直接進入且重新整理不 404
- `components/` 內不再直接 import `firebase/*`
- `InfographicGenerator.jsx` 僅負責 state 組裝與元件佈局（不含 SDK 呼叫）
- 基本冒煙測試通過（風格分析 → 生成 → 存歷史 → 讀歷史 → 刪歷史）

### 風險與回退
- 風險：拆分過程破壞既有互動或狀態同步
- 回退策略：每一步完成後保留可用版本；若驗證失敗，直接回退至上一個可 demo 的 commit

### 驗證方式
- 手動：功能冒煙測試 + 直連路由測試
- 程式碼審查：確認 service 層抽象與 hooks 依賴方向

---

## Phase 1 — Auth & API Gateway

### 範圍與原則
- 移除前端 Firebase Auth 依賴，改用 MSAL
- 所有 API 呼叫經由 Azure Functions 代理
- 強制落實統一錯誤格式與 Token 驗證

### 工作分解（WBS）
- Step 1.1：清理 Firebase 依賴與設定檔
- Step 1.2：初始化 Azure Functions + health check
- Step 1.3：前端導入 MSAL，後端驗證 Token
- Step 1.4：加入 Rate limit、CORS、統一錯誤格式

### 定義完成 (Definition of Done)
- 前端不再引用 Firebase Auth
- `/api/health` 回傳 200 `{ status: "ok" }`
- 未登入呼叫 `/api/*` 皆回 401
- 錯誤回傳格式統一 `{ error: { code, message } }`

### 風險與回退
- 風險：Token 驗證邏輯錯誤導致全站 401
- 回退策略：保留 Firebase Auth 分支；MSAL 啟用採 feature flag

### 驗證方式
- 手動：MSAL 登入/登出流程
- 自動：API health + 401/429 測試

---

## Phase 2 — Database & Storage

### 範圍與原則
- 以 PostgreSQL + Blob Storage 為唯一資料來源
- 逐步雙寫或鏡像驗證，避免一次性切換
- 先有回退路徑再切流量

### 工作分解（WBS）
- Step 2.1：建立 PostgreSQL schema + pgvector
- Step 2.2：Blob Storage 容器與 SAS Token 發放
- Step 2.3：資料遷移與一致性驗證
- Step 2.4：前端 storage service 切換 REST API

### 定義完成 (Definition of Done)
- 風格與歷史皆由 REST API 讀寫
- 圖片上傳走 SAS Token 直傳 Blob
- 資料遷移比對通過（筆數一致 + 抽樣內容一致）

### 風險與回退
- 風險：遷移後資料缺漏或一致性錯誤
- 回退策略：保留 Firestore 讀取 30 天，維持雙寫

### 驗證方式
- 自動：API CRUD + Blob 上傳測試
- 手動：前端歷史列表與風格庫完整回放

---

## Phase 3 — AI Core Integration

### 範圍與原則
- 風格分析、文件分析、圖片生成全部移至 Functions
- 前端只呼叫 REST API，不直接持有 AI Key

### 工作分解（WBS）
- Step 3.1：`/api/analyze-document` 實作
- Step 3.2：`/api/generate-images` 實作
- Step 3.3：`/api/analyze-style` 實作
- Step 3.4：安全強化與敏感詞過濾

### 定義完成 (Definition of Done)
- 前端程式碼無任何 AI Key
- 連續場景批次生成可用
- 失敗重試策略生效且有上限

### 風險與回退
- 風險：模型回應格式變動導致前端解析失敗
- 回退策略：保留舊版 SDK 路徑與 feature flag

### 驗證方式
- 手動：PDF/Docx/PPTx 分析 + 單張生成
- 自動：API 回應結構驗證 + 重試測試

---

## Phase 4 — 企業級功能與 Polish

### 範圍與原則
- 以企業合規為優先，預設最小權限
- 以可觀測性與成本可控為核心
- 功能解鎖採 feature flag 與租戶層級設定

### 工作分解（WBS）
- 多租戶隔離 + Row Level Security
- 角色權限控制（管理員 / 編輯者 / 檢視者）
- 用量配額與成本儀表板
- i18n 國際化 (react-i18next)
- 佇列化批次生成與 Webhook
- CI/CD + 監控整合 (Application Insights)

### 定義完成 (Definition of Done)
- 租戶間資料 100% 隔離
- 權限角色可控，審計日誌可追溯
- 主要儀表板可視化 API 成本與使用量
- 企業級可靠度與可觀測性達標

### 風險與回退
- 風險：多租戶設計錯誤造成資料外洩
- 回退策略：租戶切換功能預設關閉，分批啟用

### 驗證方式
- 自動：RLS 測試 + 權限測試 + 佇列壓測
- 手動：跨租戶資料驗證 + i18n UI 檢查
