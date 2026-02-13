# Line Bot 圖片發送功能整合指南

本文件說明如何將 Line Bot 功能整合至 `Genpic-master` 專案，實現「使用者發送圖片到 Line 群組」的需求。

## 1. 架構分析與設計

### 1.1 需求分析
目標：讓使用者能夠將生成或上傳的圖片，透過 Line Bot 發送到指定的 Line 群組。

### 1.2 解決方案選擇
我們選擇 **直接整合 (Direct Integration)** 模式，而非架設獨立的 MCP Server。
*   **原因**：Genpic 專案已使用 Azure Functions 作為後端，直接在現有架構中加入 Line Messaging API 的呼叫是最輕量、效能最好且維護成本最低的方式。
*   **流程**：
    1.  **前端**：使用者產生圖片 -> 圖片上傳至 Azure Blob Storage -> 取得公開存取 URL (SAS URL)。
    2.  **前端**：呼叫後端 API (例如 `/api/send-line-image`)，帶入圖片 URL。
    3.  **後端**：Azure Function 接收請求 -> 驗證權限 -> 使用 Line Messaging API (`pushMessage` 或 `multicast`) 將圖片推送到指定群組。

## 2. 前置準備 (Line Developers Console)

在開始寫程式之前，需要先設定 Line 帳號。

1.  登入 [Line Developers Console](https://developers.line.biz/)。
2.  建立一個新的 **Provider** (如果你還沒有)。
3.  在 Provider 下建立一個新的 **Messaging API** Channel。
4.  **重要設定**：
    *   **Channel Secret**: 在 "Basic settings" 頁籤中找到，稍後後端設定需要。
    *   **Channel Access Token**: 在 "Messaging API" 頁籤中，產生一個長期有效的 Token (Long-lived access token)。
    *   **Allow bot to join group chats**: 在 "Messaging API" 設定中，確保 Bot 被允許加入群組。
5.  **取得群組 ID (Group ID)**：
    *   這部分比較 tricky。最簡單的方法是暫時開啟一個 Webhook (例如使用 Ngrok)，將 Bot 加入群組，然後從 Webhook 的 `join` 事件中取得 Group ID。
    *   或者，初期開發可以先測試推送到個人 (User ID)，User ID 可以在 "Basic settings" 下方的 "Your user ID" 找到。

## 3. 後端實作 (Azure Functions)

### 3.1 安裝依賴
在 `api` 目錄下安裝 Line Bot SDK：

```bash
cd api
npm install @line/bot-sdk
```

### 3.2 設定環境變數
在 `api/local.settings.json` (本地開發) 和 Azure Portal 的 Configuration (正式環境) 中加入：

```json
{
  "Values": {
    "LINE_CHANNEL_ACCESS_TOKEN": "您的_CHANNEL_ACCESS_TOKEN",
    "LINE_CHANNEL_SECRET": "您的_CHANNEL_SECRET",
    "LINE_TARGET_GROUP_ID": "目標群組ID_或是_USER_ID"
  }
}
```

### 3.3 建立 Azure Function (`api/send-line-image`)
建立一個新的 Function 用於處理發送請求。

**檔案位置**: `api/send-line-image/index.js`

```javascript
const line = require('@line/bot-sdk');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

module.exports = async function (context, req) {
  context.log('Processing send-line-image request');

  // 1. 驗證請求
  const { imageUrl } = req.body;
  
  if (!imageUrl) {
    context.res = {
      status: 400,
      body: "Please provide an imageUrl"
    };
    return;
  }

  // 2. 準備 Line 訊息物件
  // 注意：Line 要求圖片 URL 必須是 HTTPS 且有公開存取權限
  const message = {
    type: 'image',
    originalContentUrl: imageUrl,
    previewImageUrl: imageUrl // 縮圖可以使用同一張，或是另外產生較小的縮圖
  };

  const targetId = process.env.LINE_TARGET_GROUP_ID;

  if (!targetId) {
    context.res = {
      status: 500,
      body: "LINE_TARGET_GROUP_ID is not configured"
    };
    return;
  }

  try {
    // 3. 發送訊息
    await client.pushMessage(targetId, message);

    context.res = {
      status: 200,
      body: { success: true, message: "Image sent to Line" }
    };
  } catch (error) {
    context.log.error('Error sending message to Line:', error);
    context.res = {
      status: 500,
      body: { 
        success: false, 
        message: "Failed to send message", 
        error: error.originalError?.response?.data || error.message 
      }
    };
  }
};
```

**檔案位置**: `api/send-line-image/function.json`

```json
{
  "bindings": [
    {
      "authLevel": "anonymous",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["post"]
    },
    {
      "type": "http",
      "direction": "out",
      "name": "res"
    }
  ]
}
```

## 4. 前端實作 (React)

在前端頁面中，當圖片生成完畢後，可以加入一個 "Share to Line" 的按鈕。

### 4.1 呼叫範例

```javascript
const shareToLine = async (imageUrl) => {
  try {
    const response = await fetch('/api/send-line-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageUrl }),
    });

    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    const result = await response.json();
    alert('圖片已發送至 Line 群組！');
  } catch (error) {
    console.error('Error sharing to Line:', error);
    alert('發送失敗，請稍後再試。');
  }
};
```

### 4.2 按鈕元件 (範例)

```jsx
import { Share2 } from 'lucide-react';
import { Button } from "@/components/ui/button";

export function ShareToLineButton({ imageUrl }) {
  return (
    <Button 
      variant="outline" 
      onClick={() => shareToLine(imageUrl)}
      className="gap-2"
    >
      <Share2 className="h-4 w-4" />
      分享到 Line 群組
    </Button>
  );
}
```

## 5. 注意事項與限制

1.  **Https 限制**: Line API 要求圖片 URL 必須是 `https` 開頭。Azure Blob Storage 預設支援 HTTPS，所以這部分通常沒問題。
2.  **圖片大小限制**:
    *   最大解析度：1024 x 1024 (雖然 API 文件有此建議，但通常較大圖片也會自動縮放，但為了效能建議不要過大)。
    *   最大檔案大小：10 MB。
3.  **Push Message 費用**: Line Messaging API 的 `pushMessage` (主動推播) 是依據訊息量計費的。免費版帳號 (Communication Plan) 每月有訊息則數限制 (通常是 200 則)。如果群組人數多或發送頻率高，可能需要升級方案，或者改用 LIFF (Line Front-end Framework) 直接讓使用者從自己的帳號分享。
4.  **群組 ID 取得**: 這是最麻煩的一步。Bot 不需要 User ID 就能被加入群組，但若要主動 Push 到群組，Bot 必須知道該群組的 ID。通常需要寫一個簡單的 Webhook 來監聽 `join` 事件，當 Bot 被拉進群組時，Line 會發送包含 `groupId` 的 Webhook 給你，藉此記錄下來。

## 6. 進階：如何自動取得 Group ID (Webhook)

如果需要更靈活地讓 Bot 加入不同群組，建議實作 Webhook：

1.  建立 `api/line-webhook`。
2.  設定 Line Console 的 Webhook URL 指向這個 API。
3.  處理 `join` 事件，將 `groupId` 存入資料庫。

```javascript
// Webhook 簡化範例
module.exports = async function (context, req) {
    const events = req.body.events;
    for (const event of events) {
        if (event.type === 'join' && event.source.type === 'group') {
            const groupId = event.source.groupId;
            context.log(`Bot joined group: ${groupId}`);
            // TODO: 將 groupId 存入資料庫
        }
    }
    context.res = { status: 200 };
};
```
