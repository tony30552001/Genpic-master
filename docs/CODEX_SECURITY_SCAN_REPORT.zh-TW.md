# 安全性審查：genpic_master

## 範圍

針對目前位於 D:\Dev\genpic_master、修訂版本為 73512d2dc2c60e36c78f28496ebdb2c299f8c88d 的 Git 工作目錄，執行標準單次靜態稽核。

- 掃描模式：repository
- 目標類型：git_worktree
- 目標 ID：target_sha256_033b570270c1d6d054614cab886aee8eaef7878e0a49acff1d360c4077f0eaea
- 修訂版本：73512d2dc2c60e36c78f28496ebdb2c299f8c88d
- 快照摘要：codex-security-snapshot/v1:sha256:98b6c73271c80f7a5995d1fd618853c7909a377e44e6374c1b0d8145f421e394
- 清查策略：repository
- 納入路徑：.
- 排除路徑：無
- 執行期或測試狀態：離線靜態分析
- 已審查項目：api/ 進入點與共用驗證、授權、儲存、資料庫、模型、工作、剖析器及 HTTP 控制；src/ 驗證、上傳、呈現與管理流程；services/ppt-master-service/ 的 HTTP、檔案系統、子行程及容器邊界；db/migrations/、部署工作流程、設定、文件與針對性測試
- 掃描背景：未套用使用者提供的威脅模型或儲存庫 SECURITY.md。歷史稽核文件僅視為不受信任的輔助資料；目前的原始碼、測試與設定才是權威依據。

限制與排除項目：

- 僅進行靜態審查；未實際操作 Azure、PostgreSQL、OAuth、儲存體、網路及正式環境控制。
- 未進行線上弱點公告查詢或剖析器模糊測試。
- 未逐行稽核產生的證據頁面、二進位資產、建置輸出及不可執行的設計資料集。
- 排除 openwiki/**：產生的證據索引。
- 排除 dist/** 與 node_modules/**：產生的建置／相依套件目錄樹。
- 排除 public/* 與 api/assets/*.pptx：二進位資產。
- 排除 .github/prompts/**/data/**：不可執行的設計資料集。

### 掃描摘要

| 欄位 | 值 |
| --- | --- |
| 可報告發現 | 9 |
| 嚴重度分布 | 中：5，低：4 |
| 信心程度分布 | 高：7，中：2 |
| 涵蓋程度 | 部分 |
| 驗證模式 | 在獨立基準檢查與兩項聚焦調查後，由主掃描進行驗證 |

標準產出檔案為 scan-manifest.json、findings.json 與 coverage.json。本報告是由這些檔案以確定性方式產生的內容。

## 威脅模型

系統由 React 用戶端、Express／Azure 相容 API、PostgreSQL、Azure Blob Storage、外部身分／LLM／影像／LINE 供應商、背景工作程式，以及使用金鑰驗證的 Python PPT 附屬服務組成。

### 資產

- 工作階段與 CSRF 憑證
- 租戶身分、角色與使用者資料
- 上傳／產生的 Blob
- LINE／模型機密
- 資料庫憑證／資料
- 供應商配額／內容
- 服務可用性

### 信任邊界

- 網際網路／瀏覽器至 API
- 一般使用者至租戶／使用者／管理員控制
- API／工作程式至儲存體與 PostgreSQL
- 應用程式至身分／模型／LINE 供應商
- Node 後端至 PPT 附屬服務
- 上傳的位元組／URL 至剖析器

### 攻擊者能力

- 未驗證 HTTP 存取與登入連結控制
- 通過驗證後提交 URL、檔名、上傳內容、樣式與工作
- 租戶管理員可管理模型與使用者
- 在個別發現所述情況下，攻擊者可控制公開 HTTPS 端點或位於網路路徑上

### 安全目標

- 不可變的身分綁定與所有權授權
- 不得任意存取內部網址或取得 Blob 權能
- 保護機密與供應商邊界
- 限制位元組數、剖析器工作量與成本
- 驗證資料庫與服務對端

### 假設

- api/server.js 依文件所述方式部署
- 不安全的受保護 HTTP 方法需要有效的工作階段與 CSRF 權杖
- 儲存體／模型功能已設定機密
- 不計入未觀察到的閘道／網路控制

## 發現

| 發現 | 嚴重度 | 信心程度 | 詳細說明 |
| --- | --- | --- | --- |
| [樣式分析會由 API 工作程式擷取任意的已驗證 URL](#finding-1) | 中 | 高 | 見下文 |
| [管理員可透過修改端點外洩已儲存的模型金鑰](#finding-2) | 中 | 高 | 見下文 |
| [大型要求與文件內容在有效資源控制前即被完整緩衝](#finding-3) | 中 | 中 | 見下文 |
| [儲存體 Blob 權能未限定於已驗證的擁有者](#finding-4) | 中 | 高 | 見下文 |
| [任何租戶使用者都可觸發租戶全域的嵌入向量回填工作](#finding-5) | 中 | 高 | 見下文 |
| [PostgreSQL TLS 接受不受信任的伺服器憑證](#finding-6) | 低 | 高 | 見下文 |
| [既有帳號依可變更的電子郵件，而非供應商主體識別碼解析](#finding-7) | 低 | 中 | 見下文 |
| [未授權的樣式刪除會在檢查所有權前變更租戶全域歷史紀錄](#finding-8) | 低 | 高 | 見下文 |
| [OAuth 返回路徑接受經瀏覽器正規化後的外部重新導向](#finding-9) | 低 | 高 | 見下文 |

### 信心程度標準

| 標籤 | 意義 |
| --- | --- |
| 高 | 直接證據支持此發現，且沒有尚未解決的重大阻礙。 |
| 中 | 證據支持合理的問題，但仍缺少重要的執行期或可達性證明。 |
| 低 | 證據不完整，僅為明確後續追蹤而保留此項目。 |

<a id="finding-1"></a>

### [1] 樣式分析會由 API 工作程式擷取任意的已驗證 URL

| 欄位 | 值 |
| --- | --- |
| 嚴重度 | 中 |
| 信心程度 | 高 |
| 信心理由 | 要求欄位會直接傳入不受限制的 fetch；其他同類路由使用的共用 URL 驗證器並未被呼叫。 |
| 類別 | 伺服器端要求偽造（server-side-request-forgery） |
| CWE | CWE-918 |
| 受影響程式碼 | api/analyze-style/index.js:38-46、api/analyze-style/index.js:64-65、api/analyze-style/index.js:84-96、api/_shared/urlValidator.js:60-96 |

#### 摘要

樣式分析端點會將 imageUrl 直接傳給 fetch、完整緩衝回應，再送至分析模型；過程中未驗證 URL、重新導向、逾時、大小或媒體類型。

#### 根本原因

端點接受任意遠端 URL，而非由使用者擁有的上傳識別碼，並略過共用 URL 驗證器。

**不受限制的對外擷取** — api/analyze-style/index.js:38-45

呼叫端提供的 URL 會在自動跟隨重新導向的情況下被擷取並完整緩衝，未套用目的地或資源控制。

    const response = await fetch(imageUrl);
    ...
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

#### 驗證

驗證身分與要求次數限制無法阻止內部連線、重新導向、無上限緩衝，或透過模型間接洩漏資料。

驗證方法：追蹤來源至接收端，並與其他影像路由比較。

- 狀態：已驗證
- 處置：應列入報告

確認事項：

- imageUrl 由要求控制。
- 未使用 URL 驗證器或 AbortSignal。
- 回應內容會傳給 generateJson。

反證與剩餘不確定性：

- 未加入特殊中繼資料標頭。
- 原始位元組不會直接回傳。
- 需要登入。

#### 資料流

imageUrl → fetch → arrayBuffer → base64 → 模型 → 分析回應

- 來源：要求本文
- 接收端：伺服器端 fetch
- 結果：內部存取、探測、阻斷服務或間接資料洩漏

#### 可達性

登入後可直接呼叫 POST /api/analyze-style。

- 攻擊者：已驗證的一般使用者
- 進入點：POST /api/analyze-style
- 來源：imageUrl
- 接收端：全域 fetch
- 結果：SSRF

既有控制：

- 身分驗證
- 行程內要求次數計數器

#### 嚴重度

**中** — 後端可連線至內部服務並消耗大型回應，但攻擊者必須先通過驗證，而且原始位元組不會直接回傳。

新增執行期或部署證據後，嚴重度可能提高或降低。

影響評估：

- 等級：高
- 理由：可能暴露內部服務與工作程式資源。

可能性評估：

- 等級：中
- 理由：有價值的目標與外洩精確度會因部署而異。

#### 修正建議

優先使用已驗證所有權的上傳 ID。否則，應使用集中式擷取器，針對確切主機採用允許清單、在連線時驗證 DNS／IP、逐次檢查重新導向、設定短逾時與串流位元組上限，並驗證影像 MIME 類型與魔術位元組。

測試：

- 拒絕私有、回送、連結本機與中繼資料位址。
- 拒絕導向受阻擋主機的重新導向。
- 中止過大或過慢的回應。
- 拒絕非影像內容。

預防性控制：

- 強化的對外擷取器
- 輸出流量篩選

<a id="finding-2"></a>

### [2] 管理員可透過修改端點外洩已儲存的模型金鑰

| 欄位 | 值 |
| --- | --- |
| 嚴重度 | 中 |
| 信心程度 | 高 |
| 信心理由 | 保留金鑰的更新、寬鬆的端點驗證、機密解密、模型測試及對外標頭形成直接鏈結。 |
| 類別 | 敏感資料暴露（sensitive-data-exposure） |
| CWE | CWE-522、CWE-200 |
| 受影響程式碼 | api/_shared/llmModels.js:174-194、api/_shared/urlValidator.js:40-51、api/admin/index.js:559-570、api/_shared/llmModels.js:389-407、api/_shared/azureOpenAI.js:136-153 |

#### 摘要

模型更新可保留加密的 API 金鑰，同時將 Azure 端點替換成任何公開 HTTPS 主機；測試已儲存模型時，系統會解密金鑰並傳送至該端點。

#### 根本原因

機密未與經驗證的供應商端點綁定，而且使用遮罩金鑰更新時，跨越端點信任邊界仍會保留原憑證。

**端點變更仍保留金鑰** — api/_shared/llmModels.js:174-194

未提供新金鑰時，端點變更仍會保留先前的機密。

    endpoint = $4,
    api_key_encrypted = COALESCE($5, api_key_encrypted),
    ...
    key ? encrypt(key) : null,

**將解密金鑰傳送至外部** — api/_shared/azureOpenAI.js:136-141

測試時會將已儲存的金鑰傳送至資料庫所記錄的端點。

    fetch(getResponsesEndpoint(model.endpoint), {
      ...
      headers: { "api-key": model.apiKey },

#### 驗證

GET 會遮蔽金鑰，但更新／測試流程可成為擷取管道，將金鑰送至管理員控制的任意 HTTPS 主機。

驗證方法：追蹤管理員更新 → 端點驗證器 → 已儲存模型測試 → 解密 → fetch 標頭。

- 狀態：已驗證
- 處置：應列入報告

確認事項：

- 接受任何公開 HTTPS 主機。
- 端點變更會保留金鑰。
- 測試已儲存模型時會解密金鑰。
- fetch 會在 api-key 標頭送出金鑰。

反證與剩餘不確定性：

- 套用 requireAdmin 與租戶範圍限制。
- AES-GCM 儲存可保護靜態資料。
- 管理員可控制指派，但讀取另一位操作人員的明文憑證屬於不同的安全邊界。

#### 資料流

PUT 端點 → 保留金鑰 → 測試 → 解密 → 將 api-key 傳至攻擊者主機

- 來源：管理員端點更新
- 接收端：攻擊者的 HTTPS 伺服器
- 結果：憑證遭竊

#### 可達性

可直接透過模型更新／測試管理 API 觸發。

- 攻擊者：租戶管理員或遭竊的管理員工作階段
- 進入點：管理模型 API
- 來源：可變更的端點
- 接收端：對外 fetch
- 結果：金鑰外洩

前置條件：

- 已儲存含金鑰的 Azure 模型

既有控制：

- requireAdmin
- 租戶範圍限制
- 靜態加密
- HTTPS 檢查

#### 嚴重度

**中** — 可可靠洩漏供應商憑證，但需要租戶管理員權限，所跨越的是範圍較窄的機密管理邊界。

新增執行期或部署證據後，嚴重度可能提高或降低。

影響評估：

- 等級：高
- 理由：供應商金鑰及未來使用者內容可能外洩。

可能性評估：

- 等級：高
- 理由：取得管理員權限後無須猜測。

#### 修正建議

將憑證綁定至標準化的供應商端點。變更供應商或端點時清除金鑰並要求重新輸入；以確切 Azure OpenAI 主機允許清單配合 DNS／IP 檢查；絕不可使用先前被遮蔽的憑證測試已修改的端點。

測試：

- 變更端點／供應商會清除金鑰。
- 拒絕任意公開主機。
- 先前金鑰絕不會送至已變更的端點。
- 阻擋解析至私有位址的 DNS。

預防性控制：

- 端點允許清單
- 機密與端點綁定
- 稽核／輪替

<a id="finding-3"></a>

### [3] 大型要求與文件內容在有效資源控制前即被完整緩衝

| 欄位 | 值 |
| --- | --- |
| 嚴重度 | 中 |
| 信心程度 | 中 |
| 信心理由 | 緩衝順序與來源缺少限制皆有明確證據；但正式環境入口與行程限制未知。 |
| 類別 | 資源耗盡（resource-exhaustion） |
| CWE | CWE-400 |
| 受影響程式碼 | api/server.js:32-37、api/analyze-document/index.js:122-136、api/analyze-document/index.js:221-248、api/_shared/deckJobs.js:302-316、api/analyze-style/index.js:38-45、api/_shared/rateLimit.js:1-26 |

#### 摘要

服務在身分驗證前最多緩衝 100 MB JSON，而遠端及 Blob 文件／樣式路徑會在剖析器或大小控制前完整緩衝內容。

#### 根本原因

位元組、時間與並行限制套用得太晚或完全未套用；要求次數限制無法約束內容配置。

**驗證前先接收 100 MB JSON** — api/server.js:32-37

所有 JSON 路由都會在身分驗證／速率檢查前緩衝內容。

    const apiBodyLimit = process.env.API_BODY_LIMIT || "100mb";
    ...
    app.use(express.json({ limit: apiBodyLimit }));

**完整緩衝遠端文件** — api/_shared/deckJobs.js:302-316

在配置記憶體前沒有位元組上限、串流計數器或 AbortSignal。

    const buffer = await blobClient.downloadToBuffer();
    ...
    buffer: Buffer.from(await response.arrayBuffer()),

#### 驗證

下游 AnyDoc／附屬服務的限制是在 Node 行程已緩衝內容後才生效；未驗證的 JSON 剖析也先於路由防護。

驗證方法：檢查中介軟體順序、SAS 上傳、緩衝、剖析器呼叫、附屬服務限制、重試與速率限制。

- 狀態：已驗證
- 處置：應列入報告

確認事項：

- 全域預設上限為 100mb。
- 儲存體／fetch 路徑會完整緩衝。
- SAS 上傳不經過 JSON 大小限制。

反證與剩餘不確定性：

- 附屬服務有 50 MB 上限與逾時。
- AnyDoc 有結構限制。
- 閘道可能有額外限制，但尚未驗證。
- 已驗證路由有要求次數限制。

#### 資料流

要求／Blob → 完整緩衝 → base64／原生剖析 → 記憶體／CPU

- 來源：遠端內容
- 接收端：Node 堆積／剖析器
- 結果：API／工作程式阻斷服務

#### 可達性

全域中介軟體位於驗證前；遠端接收端位於驗證後。

- 攻擊者：遠端用戶端或已驗證的上傳者
- 進入點：JSON API／分析／簡報工作路由
- 來源：大型位元組內容
- 接收端：記憶體／剖析器
- 結果：可用性喪失

前置條件：

- 入口允許文件所載大小

既有控制：

- 100 MB 上限
- 要求次數限制
- 剖析器／附屬服務下游限制

#### 嚴重度

**中** — 大型未驗證要求本文與已驗證的遠端 Blob 可消耗工作程式記憶體，但入口限制及自動擴展取決於部署。

新增執行期或部署證據後，嚴重度可能提高或降低。

影響評估：

- 等級：高
- 理由：可能影響 API／工作程式可用性與成本。

可能性評估：

- 等級：中
- 理由：酬載容易建立，但平台限制未知。

#### 修正建議

設定較小的全域 JSON 上限，並為個別路由設定更精確限制。在配置記憶體前強制執行串流位元組、解碼後 base64、逾時、並行與剖析器隔離限制；隔離直接上傳內容，且不要重試確定性的資源限制失敗。

測試：

- 在入口拒絕過大的未驗證 JSON。
- 遠端內容串流達位元組上限時立即中止。
- 限制剖析器並行數。
- 在剖析前隔離過大的 SAS 上傳。

預防性控制：

- 邊緣限制
- 串流擷取
- 剖析器隔離
- 分散式配額

<a id="finding-4"></a>

### [4] 儲存體 Blob 權能未限定於已驗證的擁有者

| 欄位 | 值 |
| --- | --- |
| 嚴重度 | 中 |
| 信心程度 | 高 |
| 信心理由 | 三個可達的實作都會把呼叫者選定的儲存位置傳給帳戶金鑰操作，且未驗證所有權。 |
| 類別 | 存取控制失效（broken-access-control） |
| CWE | CWE-862、CWE-639 |
| 受影響程式碼 | api/blob-sas/index.js:60、api/blob-sas/index.js:39-40、api/blob-sas/index.js:72-95、api/analyze-document/index.js:104-136、api/deck-jobs/index.js:230-250、api/_shared/deckJobs.js:290-303、src/services/storageService.js:84-109 |

#### 摘要

已驗證使用者可自行選擇儲存體容器與 Blob 名稱，用於核發 SAS、同步分析及排入佇列的簡報擷取，過程中沒有依租戶／使用者查詢所有權。

#### 根本原因

使用者提供的儲存位置被當成物件授權證明，而不是依 tenant_id 與 user_id 解析具租戶範圍的不透明上傳紀錄。

**由呼叫者選擇 SAS 目標** — api/blob-sas/index.js:39-76

路由使用帳戶憑證，對呼叫者選擇的容器與 Blob 名稱簽發權限。

    const { fileName, container } = req.body || {};
    const containerName = container || process.env.BLOB_CONTAINER_DEFAULT || "uploads";
    ...
    blobName: fileName,
    permissions: BlobSASPermissions.parse("crw"),

**使用帳戶金鑰讀取文件** — api/analyze-document/index.js:104-122

以帳戶金鑰下載由呼叫者 URL 路徑選定的內容，未驗證所有權。

    if (account && key && documentUrl.includes(blobHost)) {
      const url = new URL(documentUrl);
      ...
      const blobClient = blobServiceClient.getContainerClient(containerName).getBlobClient(blobName);
      const downloadResponse = await blobClient.download(0);

#### 驗證

系統具備身分驗證、CSRF、MIME 與語法檢查，但使用帳戶金鑰前，沒有資料庫所有權查詢或固定使用者命名空間。

驗證方法：針對 SAS 核發、同步文件分析、簡報工作擷取、用戶端上傳輔助函式，以及具所有權控管的工作下載流程進行靜態追蹤。

- 狀態：已驗證
- 處置：應列入報告

確認事項：

- 呼叫者可覆寫容器與確切 Blob 名稱。
- 兩條分析路徑會使用 StorageSharedKeyCredential 下載 URL 指定的 Blob。
- 一般用戶端會提交未加命名空間的原始檔名。

反證與剩餘不確定性：

- Blob 層級 SAS 不允許列出內容。
- 產生的成品使用 UUID 路徑，不易猜測。
- 所有受影響路由都需要登入。

#### 資料流

要求中的儲存位置 → 解析 → 帳戶金鑰 SAS／下載 → 權杖、模型分析或產生簡報

- 來源：已驗證要求本文
- 接收端：Azure Storage SAS 或 BlobServiceClient
- 結果：跨使用者資料洩漏或毀損

#### 可達性

可直接透過 POST /api/blob-sas、/api/analyze-document 或 /api/deck-jobs 觸發。

- 攻擊者：已驗證的一般使用者
- 進入點：應用程式 API
- 來源：container／fileName／documentUrl
- 接收端：帳戶金鑰儲存操作
- 結果：未授權的儲存體權能

前置條件：

- 已知或可預測的確切 Blob 路徑

既有控制：

- 工作階段與 CSRF 驗證
- 行程內要求次數計數器
- 名稱／MIME 檢查

#### 嚴重度

**中** — 可讀取或覆寫其他使用者的 Blob，但因不允許列出內容，攻擊者必須先通過驗證，並知道或預測確切路徑。

新增執行期或部署證據後，嚴重度可能提高或降低。

影響評估：

- 等級：高
- 理由：私人文件或產生成品可能遭洩漏或覆寫。

可能性評估：

- 等級：中
- 理由：原始上傳檔名可預測，但產生的 UUID 路徑不可預測。

#### 修正建議

使用伺服器端固定容器，以及位於不可變租戶／使用者命名空間內的不透明上傳 ID。持久化所有權，並依 tenant_id 與 user_id 解析每次上傳／讀取。只對新物件核發短期且僅能建立的上傳權能、阻擋產生成品容器，並以經授權的短期讀取取代一年期讀取 SAS URL。

測試：

- 在任何儲存操作前拒絕其他使用者的上傳 ID。
- 不得為呼叫者選擇的容器或既有 Blob 名稱簽發權限。
- 物件名稱由伺服器產生，並受租戶／使用者範圍限制。
- 讀取權能需要所有權且會快速到期。

預防性控制：

- 固定容器允許清單
- 所有權資料表
- 最小權限 SAS
- 經驗證的下載代理

<a id="finding-5"></a>

### [5] 任何租戶使用者都可觸發租戶全域的嵌入向量回填工作

| 欄位 | 值 |
| --- | --- |
| 嚴重度 | 中 |
| 信心程度 | 高 |
| 信心理由 | 防護條件、查詢範圍、要求選項與供應商呼叫迴圈皆有明確證據。 |
| 類別 | 缺少授權（missing-authorization） |
| CWE | CWE-862 |
| 受影響程式碼 | api/styles-backfill/index.js:22-39、api/styles-backfill/index.js:42-45、api/styles-backfill/index.js:51-72、api/server.js:155-158 |

#### 摘要

回填端點使用 requireAuth 而非 requireAdmin，會處理整個租戶的私人樣式，並允許透過可重複執行的 dry-run 呼叫供應商。

#### 根本原因

具特權的維護操作只受一般身分驗證保護，沒有角色或所有權授權。

**一般使用者可觸發租戶維護** — api/styles-backfill/index.js:22-66

租戶全域的供應商工作沒有管理員／擁有者防護，且 dry-run 仍會執行該工作。

    const auth = await requireAuth(context, req);
    ...
    const dryRun = Boolean(req.body?.dryRun);
    ...
    SELECT id, prompt, description, tags FROM styles WHERE tenant_id = $1 AND embedding IS NULL
    ...
    const values = await embedText(modelName, text);

#### 驗證

雖然不會回傳提示文字，但私人樣式仍會被處理、ID／狀態會暴露，而且付費工作可重複觸發。

驗證方法：檢查路由、防護、查詢、迴圈、dry-run 與回應。

- 狀態：已驗證
- 處置：應列入報告

確認事項：

- 未使用 requireAdmin。
- 查詢未包含 created_by。
- dryRun 會呼叫 embedText，但不會將工作標記完成。

反證與剩餘不確定性：

- 需要登入、CSRF 與通過要求次數限制。
- 無法跨租戶存取。
- 不會回傳提示文字。

#### 資料流

limit／dryRun → 租戶 SELECT → embedText → 計費 → ID／數量

- 來源：已驗證要求本文
- 接收端：嵌入向量供應商
- 結果：未授權成本與處理

#### 可達性

公開 API 僅受 requireAuth 保護。

- 攻擊者：已驗證的非管理員
- 進入點：POST /api/styles/backfill-embeddings
- 來源：limit／dryRun
- 接收端：embedText
- 結果：濫用租戶維護

既有控制：

- 工作階段／CSRF
- 租戶條件
- 行程內要求次數計數器

#### 嚴重度

**中** — 一般使用者每次要求最多可觸發 100 次針對租戶資料的付費呼叫，並可重複執行 dry-run。

新增執行期或部署證據後，嚴重度可能提高或降低。

影響評估：

- 等級：中
- 理由：會影響配額／成本與租戶資料處理。

可能性評估：

- 等級：高
- 理由：不需要較高角色或機密知識。

#### 修正建議

改由可稽核的管理員／背景工作流程執行；移除正式環境 dryRun，或另行授權；加入持久化工作鎖與配額。

測試：

- 非管理員收到 403，且供應商呼叫數為零。
- 每個租戶同時只能執行一個持久化工作。
- dryRun 無法繞過配額。
- 不回傳未授權的 ID。

預防性控制：

- 管理員防護
- 持久化配額／工作鎖

<a id="finding-6"></a>

### [6] PostgreSQL TLS 接受不受信任的伺服器憑證

| 欄位 | 值 |
| --- | --- |
| 嚴重度 | 低 |
| 信心程度 | 高 |
| 信心理由 | 程式碼與正式環境指引均有明確證據；只有實際網路拓撲未知。 |
| 類別 | 不當的憑證驗證（improper-certificate-validation） |
| CWE | CWE-295 |
| 受影響程式碼 | api/_shared/db.js:9-13、docs/AZURE_PORTAL_SETUP.md:135-136、docs/DEPLOYMENT_GUIDE_AZURE.md:109-110 |

#### 摘要

正式環境指引會啟用 DATABASE_SSL，但連線集區設定 rejectUnauthorized:false，因此未驗證 PostgreSQL 對端身分。

#### 根本原因

用戶端停用憑證鏈與主機名稱驗證，而不是載入受信任的 PostgreSQL CA。

**停用 PostgreSQL 憑證驗證** — api/_shared/db.js:9-13

TLS 加密會接受任何伺服器憑證。

    ssl: useSsl ? { rejectUnauthorized: false } : undefined,

#### 驗證

這可防止被動式明文觀察，但無法防止主動式伺服器冒充。

驗證方法：檢查連線集區設定與正式環境指引。

- 狀態：已驗證
- 處置：應列入報告

確認事項：

- 正式環境文件設定 DATABASE_SSL=true。
- 只要啟用 TLS，rejectUnauthorized 就是 false。

反證與剩餘不確定性：

- 需要控制網路／DNS 路徑。
- 未觀察到的私有網路可能降低暴露程度。

#### 資料流

DATABASE_URL → 未驗證 TLS → 攻擊者對端 → 資料庫資料

- 來源：應用程式連線
- 接收端：不受信任的 TLS 對端
- 結果：中間人攻擊

#### 可達性

需要控制網路路徑或 DNS。

- 攻擊者：位於網路路徑上的攻擊者
- 進入點：PostgreSQL 連線
- 來源：DATABASE_URL
- 接收端：pg TLS
- 結果：資料庫遭入侵

前置條件：

- DATABASE_SSL=true
- 位於網路路徑上

既有控制：

- TLS 加密

#### 嚴重度

**低** — 位於網路路徑上的攻擊者可能攔截憑證／資料，但可利用性取決於路由或 DNS 控制。

新增執行期或部署證據後，嚴重度可能提高或降低。

影響評估：

- 等級：高
- 理由：憑證與資料可能遭讀取／修改。

可能性評估：

- 等級：低
- 理由：需要符合特定部署條件的網路前提。

#### 修正建議

使用受管理 PostgreSQL CA 啟用完整憑證與主機名稱驗證；缺少 CA 時應拒絕啟動。

測試：

- 主機名稱錯誤／自簽憑證應連線失敗。
- 正式環境 CA 在啟用驗證時應連線成功。
- 缺少 CA 時啟動失敗。

預防性控制：

- 經驗證的 TLS
- 私有網路
- 憑證輪替

<a id="finding-7"></a>

### [7] 既有帳號依可變更的電子郵件，而非供應商主體識別碼解析

| 欄位 | 值 |
| --- | --- |
| 嚴重度 | 低 |
| 信心程度 | 中 |
| 信心理由 | 綁定缺陷有明確證據；可利用性取決於外部身分與信箱生命週期政策。 |
| 類別 | 不當的身分驗證（improper-authentication） |
| CWE | CWE-287 |
| 受影響程式碼 | api/_shared/identity.js:57-98、api/auth/index.js:174-197、api/_shared/identity.js:101-124、db/migrations/010_auth_sessions.sql:3-23 |

#### 摘要

系統雖會擷取供應商主體識別碼，但使用預設租戶加正規化電子郵件來解析使用者及繼承角色；完成對應後才儲存主體識別碼。

#### 根本原因

供應商身分被當成電子郵件索引使用者的附加資料，而不是唯一的租戶／供應商／主體綁定。

**僅以電子郵件查詢帳號** — api/_shared/identity.js:57-96

有效的身分主體只要提供相同的正規化電子郵件，就會繼承既有使用者與角色。

    WHERE tenant_id = $1 AND lower(trim(email)) = $2
    ...
    ON CONFLICT (tenant_id, (lower(trim(email))))
    ...
    ELSE users.role

#### 驗證

權杖雖經驗證，但只要不同的有效身分主體提供相同電子郵件，就會對應至相同使用者 ID。

驗證方法：追蹤供應商宣告、帳號解析、角色保留、工作階段與索引。

- 狀態：已驗證
- 處置：應列入報告

確認事項：

- 系統會擷取 sub／oid。
- getOrCreateUser 不會以這些欄位查詢。
- 既有角色會被保留。
- 登入解析不使用工作階段主體索引。

反證與剩餘不確定性：

- 未證實可偽造權杖。
- Entra 為單一租戶。
- 以相同電子郵件連結帳號可能是刻意設計。
- 碰撞／重新指派由外部政策決定。

#### 資料流

已驗證權杖 → 電子郵件 → 電子郵件查詢 → 繼承 userId／角色 → 工作階段

- 來源：有效 IdP 權杖
- 接收端：既有帳號
- 結果：繼承帳號

#### 可達性

在電子郵件碰撞時，透過一般 Google 或 Entra 登入即可觸發。

- 攻擊者：持有另一個相同電子郵件有效身分的人
- 進入點：Google 登入／Entra 回呼
- 來源：供應商電子郵件
- 接收端：getOrCreateUser
- 結果：帳號接管

前置條件：

- 電子郵件完全相同或遭重新指派

既有控制：

- 權杖驗證
- 單一租戶 Entra
- 停用使用者檢查

#### 嚴重度

**低** — 被重新指派的信箱或另一個有效的相同電子郵件身分可能繼承資料／管理員狀態，但取得完全相符的供應商宣告是重大的外部前提。

新增執行期或部署證據後，嚴重度可能提高或降低。

影響評估：

- 等級：高
- 理由：私人資源／管理員角色可能被轉移。

可能性評估：

- 等級：低
- 理由：需要發生外部生命週期碰撞。

#### 修正建議

依唯一的租戶／供應商／provider_subject 資料表解析帳號；將電子郵件視為個人資料，跨供應商連結必須明確重新驗證。並檢查遷移時可能有歧義的案例。

測試：

- 第二個具有相同電子郵件的主體不得自動繼承帳號。
- 電子郵件重新指派不得轉移帳號所有權。
- 連結帳號需要重新驗證。
- 不得只因新的相同電子郵件主體而授予管理員角色。

預防性控制：

- 不可變的主體綁定
- 明確的帳號連結

<a id="finding-8"></a>

### [8] 未授權的樣式刪除會在檢查所有權前變更租戶全域歷史紀錄

| 欄位 | 值 |
| --- | --- |
| 嚴重度 | 低 |
| 信心程度 | 高 |
| 信心理由 | 獨立 SQL 陳述式與不一致的條件有明確證據。 |
| 類別 | 存取控制失效（broken-access-control） |
| CWE | CWE-862、CWE-639 |
| 受影響程式碼 | api/styles/index.js:312-320、api/styles/index.js:97-121、api/_shared/db.js:24 |

#### 摘要

DELETE /api/styles/:id 會先清除租戶內每筆歷史紀錄的樣式參照，之後才由包含擁有者條件的刪除判斷呼叫者是否有權限。

#### 根本原因

授權只套用於最後的 DELETE；先前的相依變更已在交易外執行。

**檢查擁有者前先進行變更** — api/styles/index.js:312-320

租戶全域更新會在檢查所有權前先提交。

    UPDATE history SET style_id = NULL WHERE style_id = $1 AND tenant_id = $2
    ...
    DELETE FROM styles WHERE id = $1 AND tenant_id = $2 AND created_by = $3 RETURNING id

#### 驗證

非擁有者可使用共用樣式 ID；樣式本身仍存在，但所有符合的歷史紀錄關聯會被清除。

驗證方法：檢查清單可見性、刪除順序與查詢交易行為。

- 狀態：已驗證
- 處置：應列入報告

確認事項：

- 共用 ID 可被看見。
- UPDATE 缺少擁有者／使用者條件。
- 查詢會分別自動提交。

反證與剩餘不確定性：

- 租戶邊界仍有效。
- 底層樣式不會被刪除。
- 套用 CSRF。

#### 資料流

共用樣式 ID → DELETE 路由 → 租戶 UPDATE → 擁有者 DELETE 失敗

- 來源：路由 ID
- 接收端：history.style_id
- 結果：跨使用者中繼資料毀損

#### 可達性

任何已登入的租戶使用者都可觸發。

- 攻擊者：已驗證的非擁有者
- 進入點：DELETE /api/styles/:id
- 來源：樣式 ID
- 接收端：租戶歷史紀錄
- 結果：未授權變更

既有控制：

- 租戶條件
- 後續擁有者條件
- CSRF

#### 嚴重度

**低** — 取得共用樣式 ID 的租戶使用者很容易利用，但影響僅限單一租戶內的關聯中繼資料。

新增執行期或部署證據後，嚴重度可能提高或降低。

影響評估：

- 等級：低
- 理由：關聯會被移除，但內容仍保留。

可能性評估：

- 等級：高
- 理由：共用 ID 可被發現。

#### 修正建議

在進行任何變更前，先對含擁有者條件的樣式執行授權並鎖定；使用單一交易或含擁有者條件的 CTE 同時清除參照並刪除。

測試：

- 非擁有者刪除不會改變歷史紀錄。
- 擁有者刪除具原子性。
- 失敗時兩項操作都會回復。

預防性控制：

- 先授權再變更
- 交易

<a id="finding-9"></a>

### [9] OAuth 返回路徑接受經瀏覽器正規化後的外部重新導向

| 欄位 | 值 |
| --- | --- |
| 嚴重度 | 低 |
| 信心程度 | 高 |
| 信心理由 | 靜態追蹤與本機 WHATWG URL 解析都確認，通過驗證的值會解析至外部。 |
| 類別 | 開放式重新導向（open-redirect） |
| CWE | CWE-601 |
| 受影響程式碼 | api/_shared/entra.js:43-47、api/_shared/entra.js:76-90、api/auth/index.js:137-145 |

#### 摘要

normalizeReturnTo 會接受像 /\\evil.example 這類含反斜線的網路路徑，將其簽入 state，並在 Entra 登入後原樣寫入 Location。

#### 根本原因

以原始字串前綴檢查取代瀏覽器等效解析與受信任來源強制驗證。

**反斜線重新導向繞過** — api/_shared/entra.js:43-47

含反斜線的網路路徑可原樣通過。

    if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return "/";
    ...
    return returnTo;

#### 驗證

state 完整性保護只會簽署攻擊者選定的不安全值。

驗證方法：來源追蹤與本機 WHATWG URL 剖析器驗證。

- 狀態：已驗證
- 處置：應列入報告

確認事項：

- returnTo 由查詢字串控制。
- 反斜線可通過檢查。
- 回呼會將該值用作 Location。
- /\\evil.example 會解析至外部。

反證與剩餘不確定性：

- 會拒絕字面上的 // 與絕對 URL。
- state 已簽署，並與 Cookie／nonce 綁定且有 TTL。
- Cookie 仍限定於應用程式。

#### 資料流

returnTo → 正規化 → 已簽署 state → 回呼 Location

- 來源：查詢字串
- 接收端：302 Location
- 結果：外部重新導向

#### 可達性

攻擊者不需要通過驗證。

- 攻擊者：未驗證攻擊者
- 進入點：GET /api/auth/entra/start
- 來源：returnTo
- 接收端：回呼重新導向
- 結果：網路釣魚

前置條件：

- 受害者完成登入

既有控制：

- 已簽署 state
- Nonce
- TTL

#### 嚴重度

**低** — 可用於登入後網路釣魚，但不會洩漏工作階段權杖或授權碼。

新增執行期或部署證據後，嚴重度可能提高或降低。

影響評估：

- 等級：低
- 理由：濫用信任，但未直接洩漏權杖。

可能性評估：

- 等級：中
- 理由：利用簡單，但需要使用者互動。

#### 修正建議

拒絕反斜線與控制字元；以受信任來源為基準解析 URL；要求來源完全相同；僅輸出 path／search／hash。最好改用路由允許清單。

測試：

- 拒絕反斜線與編碼分隔符號變體。
- 只允許同源路徑。
- 回呼絕不輸出外部 Location。

預防性控制：

- 符合標準的 URL 解析
- 重新導向允許清單

## 已審查範圍

| 範圍 | 風險領域 | 結果 | 備註 |
| --- | --- | --- | --- |
| OAuth、工作階段、CSRF、身分 | 身分驗證 | 已報告 | 已報告開放式重新導向與僅依電子郵件綁定；其他權杖／state／工作階段控制有效。 |
| 租戶、使用者、管理員、樣式、歷史、範本、工作 | 授權 | 已報告 | 已報告樣式刪除順序與回填防護；其他已審查條件有效。 |
| Blob SAS 與文件／簡報擷取 | 儲存體 | 已報告 | 已報告呼叫者選擇的權能與帳戶金鑰讀取。 |
| 對外 HTTP 與 SSRF | 網路 | 已報告 | 已報告不受限制的樣式擷取。 |
| 要求／上傳／剖析器資源控制 | 可用性 | 已報告 | 已報告驗證前與遠端內容緩衝。 |
| 模型與 LINE 機密 | 憑證安全 | 已報告 | 已報告可變更模型端點造成的金鑰外洩；LINE 路徑固定且具範圍限制。 |
| SQL、租戶隔離、工作階段、PostgreSQL TLS | 資料庫 | 已報告 | 未發現 SQL 注入；已報告未驗證的 TLS。 |
| PPT 附屬服務驗證／檔案／子行程／容器 | 服務隔離 | 未發現問題 | 具備共用金鑰、安全名稱、argv 子行程、UUID 暫存、非特權容器與限制。 |
| 前端驗證儲存與執行接收端 | 用戶端 | 未發現問題 | 使用 HttpOnly 工作階段；產品中未發現 innerHTML／dangerouslySetInnerHTML／eval 接收端。 |
| CI/CD 與部署 | 供應鏈 | 未發現問題 | 權限具範圍限制，且附屬服務封存檔雜湊已釘選；主要版本標籤仍可進一步強化。 |

## 待確認問題與後續工作

- 正式環境入口／WAF 是否設定更低的本文大小、並行與速率限制？
- 是否預期租戶管理員可以存取其他管理員輸入的憑證？
- 以電子郵件為索引的使用者適用何種信箱回收與供應商連結政策？
- 無法取得正式環境入口限制、網路、儲存配置、OAuth 政策與資料庫憑證鏈。
  - 後續提示：審查延後的 live_controls 單元，補足其中所述的證明缺口。路徑：docs/AZURE_PORTAL_SETUP.md、docs/DEPLOYMENT_GUIDE_AZURE.md。範圍：auth_identity、resource_limits、database。
- 未進行線上弱點公告掃描、AnyDoc 模糊測試或 PPT 執行期沙箱測試。
  - 後續提示：審查延後的 dynamic_dependencies 單元，補足其中所述的證明缺口。路徑：api/package-lock.json、pnpm-lock.yaml、services/ppt-master-service/requirements.txt。範圍：resource_limits、ppt_sidecar。
