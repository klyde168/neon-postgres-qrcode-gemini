// app/routes/generate.tsx
import type { MetaFunction, ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Link, useActionData, json, useSubmit, useLoaderData, useRevalidator } from "@remix-run/react";
import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { randomUUID } from "node:crypto";
import { pool } from "~/utils/db.server";

// Helper for client-side logging to appear in the UI debug log
const getUiLogger = (setDebugMessages: React.Dispatch<React.SetStateAction<string[]>>) => {
  return (message: string, isError: boolean = false) => {
    const fullMessage = `[CLIENT ${new Date().toLocaleTimeString()}.${String(new Date().getMilliseconds()).padStart(3, '0')}] ${message}`;
    if (isError) console.error(fullMessage);
    else console.log(fullMessage);
    setDebugMessages(prev => [...prev.slice(Math.max(0, prev.length - 24)), fullMessage]);
  };
};

export const meta: MetaFunction = () => {
  return [
    { title: "產生 QR Code" },
    { name: "description", content: "顯示最新掃描的 QR Code 或產生新的 UUID QR Code" },
  ];
};

type QrCodeResponse = {
  qrCodeDataUrl?: string | null;
  error?: string | null;
  sourceText?: string | null;
  intent?: string | null;
  timestamp?: number;
  isLatestScan?: boolean;
  lastScannedId?: number | null;
};

export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  const loaderExecutionId = randomUUID().substring(0, 8);
  console.log(`[LOADER ${loaderExecutionId}] Initiated.`);
  
  const url = new URL(request.url);
  const forceUuid = url.searchParams.get('uuid') === 'true';
  const skipDb = url.searchParams.get('skipDb') === 'true';
  
  let textToEncode: string | null = null;
  let errorMsg: string | null = null;
  let intent = "loader-fetch-latest";
  let isLatestScan = false;
  let lastScannedId: number | null = null;
  const currentTimestamp = Date.now();

  if (forceUuid || skipDb) {
    // 強制產生新的 UUID - 每次都是全新的，不查詢資料庫
    textToEncode = randomUUID();
    intent = "loader-force-uuid";
    console.log(`[LOADER ${loaderExecutionId}] Force UUID generation (forceUuid=${forceUuid}, skipDb=${skipDb}): "${textToEncode}"`);
  } else {
    try {
      const client = await pool.connect();
      console.log(`[LOADER ${loaderExecutionId}] Database client connected.`);
      try {
        const latestScanQuery = 'SELECT data, scanned_at, id FROM scanned_data ORDER BY id DESC LIMIT 1';
        const res = await client.query(latestScanQuery);
        if (res.rows.length > 0 && res.rows[0].data) {
          textToEncode = res.rows[0].data;
          isLatestScan = true;
          lastScannedId = res.rows[0].id;
          console.log(`[LOADER ${loaderExecutionId}] Fetched latest scanned data (ID: ${res.rows[0].id}): "${textToEncode}" (scanned_at: ${res.rows[0].scanned_at})`);
        } else {
          // 沒有掃描資料時，產生新的 UUID
          textToEncode = randomUUID();
          intent = "loader-initial-uuid";
          console.log(`[LOADER ${loaderExecutionId}] No scanned data in DB, generated NEW UUID: "${textToEncode}"`);
        }
      } finally {
        client.release();
        console.log(`[LOADER ${loaderExecutionId}] Database client released.`);
      }
    } catch (dbError: any) {
      console.error(`[LOADER ${loaderExecutionId}] Database error:`, dbError.message);
      errorMsg = "讀取最新掃描資料時發生錯誤。";
      // 資料庫錯誤時，產生新的 UUID
      textToEncode = randomUUID();
      intent = "loader-db-error-fallback-uuid";
      console.log(`[LOADER ${loaderExecutionId}] DB error, generated NEW fallback UUID: "${textToEncode}"`);
    }
  }

  if (!textToEncode) {
      textToEncode = randomUUID();
      intent = "loader-final-fallback-uuid";
      console.log(`[LOADER ${loaderExecutionId}] Final fallback UUID: "${textToEncode}"`);
  }

  console.log(`[LOADER ${loaderExecutionId}] Text to encode: "${textToEncode}"`);
  
  // 確保 textToEncode 不為 null，最後的安全檢查
  if (!textToEncode) {
    textToEncode = randomUUID();
    intent = "loader-emergency-fallback-uuid";
    console.log(`[LOADER ${loaderExecutionId}] Emergency fallback NEW UUID: "${textToEncode}"`);
  }
  
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(textToEncode, {
      errorCorrectionLevel: "H", width: 256, margin: 2,
      color: { dark: "#0F172A", light: "#FFFFFF" }
    });
    console.log(`[LOADER ${loaderExecutionId}] QR Code generated successfully for: "${textToEncode}"`);
    return json({ 
      qrCodeDataUrl, 
      error: errorMsg, 
      sourceText: textToEncode, 
      intent, 
      timestamp: currentTimestamp,
      isLatestScan,
      lastScannedId
    } as QrCodeResponse);
  } catch (qrErr: any) {
    console.error(`[LOADER ${loaderExecutionId}] QR Code generation error:`, qrErr.message);
    return json({ 
      error: `產生 QR Code 失敗: ${errorMsg || qrErr.message || '未知錯誤'}`, 
      qrCodeDataUrl: null, 
      sourceText: textToEncode, 
      intent, 
      timestamp: currentTimestamp,
      isLatestScan,
      lastScannedId
    } as QrCodeResponse, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  const actionExecutionId = randomUUID().substring(0,8);
  console.log(`[ACTION ${actionExecutionId}] Initiated.`);
  
  const formData = await request.formData();
  const intent = formData.get("intent") as string | null;
  let textToEncode: string | null = null;
  let lastScannedId: number | null = null;
  const currentTimestamp = Date.now();

  console.log(`[ACTION ${actionExecutionId}] Intent: ${intent}`);

  if (intent === "generate-uuid-via-action") {
    // 每次都產生全新的 UUID，不檢查資料庫，確保唯一性
    const newUuid = randomUUID();
    textToEncode = newUuid;
    console.log(`[ACTION ${actionExecutionId}] New UNIQUE UUID generated: "${textToEncode}"`);
    console.log(`[ACTION ${actionExecutionId}] UUID verification - Length: ${textToEncode.length}, Format check: ${/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(textToEncode)}`);
  } else if (intent === "generate-from-latest-scan") {
    // 從資料庫獲取最新掃描的資料
    try {
      const client = await pool.connect();
      try {
        const latestScanQuery = 'SELECT data, id FROM scanned_data ORDER BY id DESC LIMIT 1';
        const res = await client.query(latestScanQuery);
        if (res.rows.length > 0 && res.rows[0].data) {
          textToEncode = res.rows[0].data;
          lastScannedId = res.rows[0].id;
          console.log(`[ACTION ${actionExecutionId}] Using latest scanned data (ID: ${res.rows[0].id}): "${textToEncode}"`);
        } else {
          // 如果沒有掃描資料，產生新的 UUID
          textToEncode = randomUUID();
          console.log(`[ACTION ${actionExecutionId}] No latest scan found, generated NEW UUID: "${textToEncode}"`);
        }
      } finally {
        client.release();
      }
    } catch (dbError: any) {
      console.error(`[ACTION ${actionExecutionId}] Database error:`, dbError.message);
      // 資料庫錯誤時，產生新的 UUID
      textToEncode = randomUUID();
      console.log(`[ACTION ${actionExecutionId}] DB error, generated NEW fallback UUID: "${textToEncode}"`);
    }
  } else {
    console.log(`[ACTION ${actionExecutionId}] Invalid intent received.`);
    return json({ 
      error: "無效的操作。", 
      qrCodeDataUrl: null, 
      sourceText: null, 
      intent, 
      timestamp: currentTimestamp,
      isLatestScan: false,
      lastScannedId: null
    } as QrCodeResponse, { status: 400 });
  }

  const sizeValue = formData.get("size") || "256";
  const errorCorrectionLevelValue = formData.get("errorCorrectionLevel") || "H";
  console.log(`[ACTION ${actionExecutionId}] QR Params: size=${sizeValue}, ecLevel=${errorCorrectionLevelValue}`);

  // 確保 textToEncode 不為 null，最後的安全檢查
  if (!textToEncode) {
    textToEncode = randomUUID();
    console.log(`[ACTION ${actionExecutionId}] Emergency fallback NEW UUID: "${textToEncode}"`);
  }

  try {
    const qrCodeDataUrl = await QRCode.toDataURL(textToEncode, {
      errorCorrectionLevel: errorCorrectionLevelValue as QRCode.QRCodeErrorCorrectionLevel,
      width: parseInt(sizeValue as string, 10),
      margin: 2,
      color: { dark: "#0F172A", light: "#FFFFFF" }
    });
    console.log(`[ACTION ${actionExecutionId}] QR Code generated successfully for: "${textToEncode}"`);
    return json({ 
      qrCodeDataUrl, 
      error: null, 
      sourceText: textToEncode, 
      intent, 
      timestamp: currentTimestamp,
      isLatestScan: intent === "generate-from-latest-scan",
      lastScannedId
    } as QrCodeResponse);
  } catch (err: any) {
    console.error(`[ACTION ${actionExecutionId}] QR Code generation error:`, err.message);
    return json({ 
      error: "產生 QR Code 時發生錯誤。", 
      qrCodeDataUrl: null, 
      sourceText: textToEncode, 
      intent, 
      timestamp: currentTimestamp,
      isLatestScan: false,
      lastScannedId: null
    } as QrCodeResponse, { status: 500 });
  }
}

export default function GeneratePage() {
  const initialLoaderData = useLoaderData<QrCodeResponse>();
  const actionData = useActionData<QrCodeResponse>();
  const revalidator = useRevalidator();
  const [debugMessages, setDebugMessages] = useState<string[]>([]);
  const addUiDebugMessage = useCallback(getUiLogger(setDebugMessages), []);

  const [currentDisplayData, setCurrentDisplayData] = useState<QrCodeResponse>(initialLoaderData);
  const [qrSize, setQrSize] = useState("256");
  const [errorCorrection, setErrorCorrection] = useState<QRCode.QRCodeErrorCorrectionLevel>("H");
  const [autoReloadEnabled, setAutoReloadEnabled] = useState(true);
  const [lastKnownScannedId, setLastKnownScannedId] = useState<number | null>(initialLoaderData.lastScannedId || null);
  const [forceUuidMode, setForceUuidMode] = useState(false); // 新增：強制 UUID 模式
  const imgRef = useRef<HTMLImageElement>(null);
  const submit = useSubmit();

  useEffect(() => {
    addUiDebugMessage(`Initial loaderData received: intent=${initialLoaderData.intent}, ts=${initialLoaderData.timestamp}, text="${initialLoaderData.sourceText?.substring(0,30)}...", isLatestScan=${initialLoaderData.isLatestScan}, lastScannedId=${initialLoaderData.lastScannedId}`);
    
    // 只有在不是強制 UUID 模式時才更新顯示數據
    if (!forceUuidMode) {
      setCurrentDisplayData(initialLoaderData);
      if (initialLoaderData.lastScannedId) {
        setLastKnownScannedId(initialLoaderData.lastScannedId);
      }
    } else {
      addUiDebugMessage("Force UUID mode active, ignoring loader data update");
    }
  }, [initialLoaderData, addUiDebugMessage, forceUuidMode]);

  useEffect(() => {
    if (actionData) {
      addUiDebugMessage(`Action data received: intent=${actionData.intent}, ts=${actionData.timestamp}, text="${actionData.sourceText?.substring(0,30)}...", isLatestScan=${actionData.isLatestScan}`);
      
      // 如果是產生新 UUID 的 action，優先使用 actionData 並設置強制模式
      if (actionData.intent === "generate-uuid-via-action") {
        addUiDebugMessage("UUID action detected, forcing display update and setting UUID mode");
        setCurrentDisplayData(actionData);
        setForceUuidMode(true); // 設置為強制 UUID 模式
        if (actionData.lastScannedId) {
          setLastKnownScannedId(actionData.lastScannedId);
        }
      } else if (!currentDisplayData.timestamp || (actionData.timestamp && actionData.timestamp > currentDisplayData.timestamp)) {
        addUiDebugMessage(`Updating display with actionData (ts: ${actionData.timestamp})`);
        setCurrentDisplayData(actionData);
        if (actionData.lastScannedId) {
          setLastKnownScannedId(actionData.lastScannedId);
        }
      } else {
        addUiDebugMessage(`Action data (ts: ${actionData.timestamp}) not newer than current (ts: ${currentDisplayData.timestamp}). No UI update from actionData.`);
      }
    }
  }, [actionData, addUiDebugMessage, currentDisplayData.timestamp]);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (!autoReloadEnabled) {
        addUiDebugMessage("Auto reload disabled, ignoring storage event.");
        return;
      }

      addUiDebugMessage(`Storage event: key=${event.key}, newValue=${event.newValue?.substring(0,50)}`);
      
      if (event.key === 'latestScannedDataTimestamp' || event.key === 'latestScannedDataItem') {
        const newTimestamp = event.storageArea?.getItem('latestScannedDataTimestamp');
        const lastRevalidated = localStorage.getItem('lastRevalidatedTimestamp');
        addUiDebugMessage(`Relevant storage change. NewTS: ${newTimestamp}, LastRevalidatedTS: ${lastRevalidated}`);

        if (newTimestamp && newTimestamp !== lastRevalidated) {
          addUiDebugMessage("New scan detected! Revalidating to show latest scanned QR code...");
          setForceUuidMode(false); // 關閉強制 UUID 模式，允許顯示新掃描的內容
          revalidator.revalidate();
          localStorage.setItem('lastRevalidatedTimestamp', newTimestamp);
        } else {
          addUiDebugMessage("Storage event for same timestamp or no new timestamp, no revalidation.");
        }
      }
    };

    // 自定義事件監聽器，用於確保 scan 完成後能夠觸發更新
    const handleNewScanComplete = (event: CustomEvent) => {
      if (!autoReloadEnabled) {
        addUiDebugMessage("Auto reload disabled, ignoring custom scan event.");
        return;
      }

      addUiDebugMessage(`Custom newScanComplete event received: timestamp=${event.detail?.timestamp}, data=${event.detail?.data?.substring(0,30)}...`);
      
      const lastRevalidated = localStorage.getItem('lastRevalidatedTimestamp');
      if (event.detail?.timestamp && event.detail.timestamp !== lastRevalidated) {
        addUiDebugMessage("Custom event triggered revalidation...");
        setForceUuidMode(false); // 關閉強制 UUID 模式
        revalidator.revalidate();
        localStorage.setItem('lastRevalidatedTimestamp', event.detail.timestamp);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('newScanComplete', handleNewScanComplete as EventListener);
    addUiDebugMessage(`Event listeners added. Auto-reload: ${autoReloadEnabled}`);

    // Initial check on mount for new scans
    const latestStoredTimestamp = localStorage.getItem('latestScannedDataTimestamp');
    if (latestStoredTimestamp && autoReloadEnabled) {
        addUiDebugMessage(`Initial mount check - localStorage latestScannedDataTimestamp: ${latestStoredTimestamp}, loaderData ts: ${initialLoaderData.timestamp}, intent: ${initialLoaderData.intent}`);
        const lastRevalidated = localStorage.getItem('lastRevalidatedTimestamp');
        if (latestStoredTimestamp !== lastRevalidated) {
            addUiDebugMessage("Found newer scan data in localStorage on initial mount, revalidating.");
            setForceUuidMode(false); // 關閉強制 UUID 模式
            revalidator.revalidate();
            localStorage.setItem('lastRevalidatedTimestamp', latestStoredTimestamp);
        }
    }

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('newScanComplete', handleNewScanComplete as EventListener);
      addUiDebugMessage("Event listeners removed.");
    };
  }, [revalidator, initialLoaderData.timestamp, initialLoaderData.intent, addUiDebugMessage, autoReloadEnabled]);

  const handleGenerateNewUuid = () => {
    addUiDebugMessage("Button click: handleGenerateNewUuid - 強制產生新 UUID");
    
    // 直接在客戶端生成 UUID 並顯示，避免服務器端問題
    const newUuid = crypto.randomUUID ? crypto.randomUUID() : 
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    
    const newDisplayData: QrCodeResponse = {
      qrCodeDataUrl: null,
      error: null,
      sourceText: newUuid,
      intent: "client-generated-uuid",
      timestamp: Date.now(),
      isLatestScan: false,
      lastScannedId: null
    };
    
    addUiDebugMessage(`Client-side generated UUID: ${newUuid}`);
    
    // 使用動態 import 來載入 qrcode 庫
    if (typeof window !== 'undefined') {
      import('qrcode').then((QRCodeModule) => {
        const QRCode = QRCodeModule.default || QRCodeModule;
        QRCode.toDataURL(newUuid, {
          errorCorrectionLevel: errorCorrection,
          width: parseInt(qrSize, 10),
          margin: 2,
          color: { dark: "#0F172A", light: "#FFFFFF" }
        }).then((qrCodeDataUrl: string) => {
          newDisplayData.qrCodeDataUrl = qrCodeDataUrl;
          setCurrentDisplayData(newDisplayData);
          setForceUuidMode(true);
          addUiDebugMessage(`QR Code generated successfully for UUID: ${newUuid}`);
        }).catch((err: any) => {
          addUiDebugMessage(`QR Code generation failed: ${err.message}`, true);
          newDisplayData.error = "QR Code 生成失敗";
          setCurrentDisplayData(newDisplayData);
        });
      }).catch((err: any) => {
        addUiDebugMessage(`QRCode import failed: ${err.message}`, true);
        // 退回到服務器端生成
        addUiDebugMessage("Falling back to server-side generation...");
        const formData = new FormData();
        formData.append("intent", "generate-uuid-via-action");
        formData.append("size", qrSize);
        formData.append("errorCorrectionLevel", errorCorrection);
        submit(formData, { method: "post" });
      });
    }
  };

  const handleRefreshFromLatestScan = () => {
    addUiDebugMessage("Button click: handleRefreshFromLatestScan");
    
    // 關閉強制 UUID 模式，允許顯示最新掃描資料
    setForceUuidMode(false);
    
    const formData = new FormData();
    formData.append("intent", "generate-from-latest-scan");
    formData.append("size", qrSize);
    formData.append("errorCorrectionLevel", errorCorrection);
    
    addUiDebugMessage(`Submitting latest scan refresh action...`);
    submit(formData, { method: "post" });
  };

  const getStatusMessage = () => {
    if (currentDisplayData?.intent === "client-generated-uuid") {
      return "🆕 顯示客戶端生成的新 UUID QR Code。";
    } else if (currentDisplayData?.intent === "loader-force-uuid") {
      return "🆕 顯示強制產生的新 UUID QR Code。";
    } else if (currentDisplayData?.intent === "loader-initial-uuid" || currentDisplayData?.intent?.includes("fallback-uuid")) {
      return "初始顯示 UUID QR Code。掃描新 QR Code 後將自動更新於此。";
    } else if (currentDisplayData?.intent === "loader-fetch-latest" && currentDisplayData?.isLatestScan) {
      return "✅ 顯示最新掃描的 QR Code。";
    } else if (currentDisplayData?.intent === "generate-uuid-via-action") {
      return "🆕 顯示新產生的 UUID QR Code。";
    } else if (currentDisplayData?.intent === "generate-from-latest-scan") {
      return "✅ 從最新掃描資料重新產生的 QR Code。";
    } else {
      return "掃描資料將更新於此，或點擊按鈕產生新的 QR Code。";
    }
  };

  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700 text-gray-100 p-6 font-sans">
      <div className="bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-lg">
        {/* UI Debug Log Display */}
        {debugMessages.length > 0 && (
            <div className="w-full p-2 mb-4 bg-slate-950 border border-slate-700 text-slate-400 text-xs rounded-md shadow-inner max-h-32 overflow-y-auto font-mono">
            <p className="font-semibold text-slate-300 mb-1 border-b border-slate-700 pb-1">客戶端日誌 (Client Log):</p>
            {debugMessages.map((msg, index) => (
                <div key={index} className="whitespace-pre-wrap break-all py-0.5 even:bg-slate-900 px-1">{msg.substring(msg.indexOf(']') + 2)}</div>
            ))}
            </div>
        )}

        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 mb-2">
            QR Code 產生器
          </h1>
          <p className="text-slate-400">
            {getStatusMessage()}
          </p>
        </header>

        {/* Auto-reload toggle */}
        <div className="mb-6 flex items-center justify-center space-x-3">
          <label className="text-sm text-slate-300">自動更新:</label>
          <button
            onClick={() => setAutoReloadEnabled(!autoReloadEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              autoReloadEnabled ? 'bg-green-600' : 'bg-slate-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                autoReloadEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <span className={`text-xs ${autoReloadEnabled ? 'text-green-400' : 'text-slate-400'}`}>
            {autoReloadEnabled ? '開啟' : '關閉'}
          </span>
        </div>

        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="qr-size-display" className="block text-sm font-medium text-slate-300 mb-1">
                    尺寸 (像素):
                    </label>
                    <select
                    id="qr-size-display"
                    value={qrSize}
                    onChange={(e) => setQrSize(e.target.value)}
                    className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-slate-200 focus:ring-purple-500 focus:border-purple-500"
                    >
                    <option value="128">128px</option>
                    <option value="256">256px (預設)</option>
                    <option value="384">384px</option>
                    <option value="512">512px</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="error-correction-display" className="block text-sm font-medium text-slate-300 mb-1">
                    容錯等級:
                    </label>
                    <select
                    id="error-correction-display"
                    value={errorCorrection}
                    onChange={(e) => setErrorCorrection(e.target.value as QRCode.QRCodeErrorCorrectionLevel)}
                    className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-slate-200 focus:ring-purple-500 focus:border-purple-500"
                    >
                    <option value="L">L (約 7%)</option>
                    <option value="M">M (約 15%)</option>
                    <option value="Q">Q (約 25%)</option>
                    <option value="H">H (約 30% - 預設)</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                    type="button"
                    onClick={handleRefreshFromLatestScan}
                    className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold py-3 px-4 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-indigo-500 transition-all duration-150 ease-in-out active:transform active:scale-95"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-scan-line inline-block mr-2 align-middle"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/></svg>
                    更新最新掃描
                </button>

                <button
                    type="button"
                    onClick={handleGenerateNewUuid}
                    className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-semibold py-3 px-4 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-cyan-500 transition-all duration-150 ease-in-out active:transform active:scale-95"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-refresh-cw inline-block mr-2 align-middle"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M3 21a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 16"/><path d="M21 11v5h-5"/></svg>
                    產生新 UUID
                </button>
            </div>
        </div>

        {currentDisplayData?.error && (
          <div className="mt-6 p-3 bg-red-800 bg-opacity-70 border border-red-600 text-red-200 rounded-lg text-center" role="alert">
            <p className="font-medium">錯誤：</p>
            <p>{currentDisplayData.error}</p>
          </div>
        )}

        {currentDisplayData?.qrCodeDataUrl && (
          <div className="mt-8 text-center p-6 bg-slate-700 rounded-lg shadow-inner">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-semibold text-slate-100">目前 QR Code：</h3>
              {currentDisplayData?.isLatestScan && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3"/>
                  </svg>
                  最新掃描
                </span>
              )}
              {(currentDisplayData?.intent === "generate-uuid-via-action" || 
                currentDisplayData?.intent === "loader-force-uuid" ||
                currentDisplayData?.intent === "client-generated-uuid") && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3"/>
                  </svg>
                  新 UUID
                </span>
              )}
            </div>
            {currentDisplayData?.sourceText && (
                <p className="text-xs text-slate-400 mb-3 break-all max-w-xs mx-auto">內容: {currentDisplayData.sourceText}</p>
            )}
            <div className="flex justify-center items-center bg-white p-2 rounded-md inline-block shadow-lg">
                <img
                ref={imgRef}
                src={currentDisplayData.qrCodeDataUrl}
                alt="產生的 QR Code"
                className="mx-auto"
                />
            </div>
            <a
              href={currentDisplayData.qrCodeDataUrl}
              download={`qrcode_${(currentDisplayData.sourceText?.substring(0,15).replace(/[^a-zA-Z0-9]/g, '_')) || 'generated'}.png`}
              className="mt-6 inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-slate-700 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-download mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              下載 QR Code
            </a>
          </div>
        )}

        <div className="mt-10 text-center">
          <Link
            to="/"
            className="inline-block text-sky-400 hover:text-sky-300 hover:underline transition-colors"
          >
            &larr; 返回主頁
          </Link>
        </div>
      </div>
       <footer className="mt-12 text-center text-slate-500 text-sm">
        <p>
          使用{" "}
          <a href="https://remix.run" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
            Remix
          </a>{" "}
          和{" "}
          <a href="https://tailwindcss.com" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">
            Tailwind CSS
          </a>{" "}
          製作。
        </p>
      </footer>
    </div>
  );
}