const { BlobServiceClient, StorageSharedKeyCredential } = require("@azure/storage-blob");

const account = process.env.AZURE_STORAGE_ACCOUNT;
const key = process.env.AZURE_STORAGE_KEY;

if (!account || !key) {
    console.error("請確認環境變數 `AZURE_STORAGE_ACCOUNT` 和 `AZURE_STORAGE_KEY` 已設定。");
    process.exit(1);
}

async function main() {
    const sharedKeyCredential = new StorageSharedKeyCredential(account, key);
    const blobServiceClient = new BlobServiceClient(
        `https://${account}.blob.core.windows.net`,
        sharedKeyCredential
    );

    console.log(`正在為儲存帳戶 '${account}' 設定 CORS 規則...`);

    const properties = await blobServiceClient.getProperties();

    // 更新 CORS 規則以允許前端上傳
    const newCorsRule = {
        allowedOrigins: "*", // 在生產環境建議限制為特定網域 (例如 https://thankful-island-0ab89420f.1.azurestaticapps.net)
        allowedMethods: "GET,HEAD,PUT,OPTIONS,POST,DELETE",
        allowedHeaders: "*",
        exposedHeaders: "*",
        maxAgeInSeconds: 3600,
    };

    // 檢查是否已存在規則，若無則添加
    if (!properties.cors) properties.cors = [];

    // 簡單起見，直接覆蓋或添加第一條規則
    properties.cors = [newCorsRule];

    await blobServiceClient.setProperties(properties);
    console.log("CORS 規則已成功更新！現在應該可以正常上傳檔案了。");
}

main().catch((err) => {
    console.error("設定 CORS 失敗:", err.message);
    process.exit(1);
});
