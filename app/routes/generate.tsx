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
};

export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  const loaderExecutionId = randomUUID().substring(0, 8);
  console.log(`[LOADER ${loaderExecutionId}] Initiated.`);
  let textToEncode: string;
  let errorMsg: string | null = null;
  let intent = "loader-fetch-latest";
  const currentTimestamp = Date.now();

  try {
    const client = await pool.connect();
    console.log(`[LOADER ${loaderExecutionId}] Database client connected.`);
    try {
      const latestScanQuery = 'SELECT data, scanned_at FROM scanned_data ORDER BY id DESC LIMIT 1';
      const res = await client.query(latestScanQuery);
      if (res.rows.length > 0 && res.rows[0].data) {
        textToEncode = res.rows[0].data;
        console.log(`[LOADER ${loaderExecutionId}] Fetched latest scanned data: "${textToEncode}" (scanned_at: ${res.rows[0].scanned_at})`);
      } else {
        textToEncode = randomUUID();
        intent = "loader-initial-uuid";
        console.log(`[LOADER ${loaderExecutionId}] No scanned data in DB, generated UUID: "${textToEncode}"`);
      }
    } finally {
      client.release();
      console.log(`[LOADER ${loaderExecutionId}] Database client released.`);
    }
  } catch (dbError: any) {
    console.error(`[LOADER ${loaderExecutionId}] Database error:`, dbError.message);
    errorMsg = "讀取最新掃描資料時發生錯誤。";
    textToEncode = randomUUID();
    intent = "loader-db-error-fallback-uuid";
    console.log(`[LOADER ${loaderExecutionId}] DB error, generated fallback UUID: "${textToEncode}"`);
  }

  if (!textToEncode) {
    textToEncode = randomUUID();
    intent = "loader-final-fallback-uuid";
    console.log(`[LOADER ${loaderExecutionId}] Final fallback UUID: "${textToEncode}"`);
  }

  console.log(`[LOADER ${loaderExecutionId}] Text to encode: "${textToEncode}"`);
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(textToEncode, {
      errorCorrectionLevel: "H", width: 256, margin: 2,
      color: { dark: "#0F172A", light: "#FFFFFF" }
    });
    console.log(`[LOADER ${loaderExecutionId}] QR Code generated successfully for: "${textToEncode}"`);
    return json({ qrCodeDataUrl, error: errorMsg, sourceText: textToEncode, intent, timestamp: currentTimestamp } as QrCodeResponse);
  } catch (qrErr: any) {
    console.error(`[LOADER ${loaderExecutionId}] QR Code generation error:`, qrErr.message);
    return json({ error: `產生 QR Code 失敗: ${errorMsg || qrErr.message || '未知錯誤'}`, qrCodeDataUrl: null, sourceText: textToEncode, intent, timestamp: currentTimestamp } as QrCodeResponse, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  const actionExecutionId = randomUUID().substring(0, 8);
  console.log(`[ACTION ${actionExecutionId}] Initiated.`);
  const formData = await request.formData();
  const intent = formData.get("intent") as string | null;
  const customText = formData.get("customText") as string | null;
  let textToEncode: string;
  const currentTimestamp = Date.now();

  console.log(`[ACTION ${actionExecutionId}] Intent: ${intent}, CustomText: ${customText}`);

  // Handle different intents
  switch (intent) {
    case "generate-uuid-via-action":
      textToEncode = randomUUID();
      console.log(`[ACTION ${actionExecutionId}] New UUID generated: "${textToEncode}"`);
      break;
    case "generate-custom-text":
      if (customText && customText.trim()) {
        textToEncode = customText.trim();
        console.log(`[ACTION ${actionExecutionId}] Custom text: "${textToEncode}"`);
      } else {
        console.log(`[ACTION ${actionExecutionId}] Empty custom text, generating UUID instead`);
        textToEncode = randomUUID();
      }
      break;
    case "update-latest-scan":
      // Fetch latest scan from database
      try {
        const client = await pool.connect();
        try {
          const latestScanQuery = 'SELECT data FROM scanned_data ORDER BY id DESC LIMIT 1';
          const res = await client.query(latestScanQuery);
          if (res.rows.length > 0 && res.rows[0].data) {
            textToEncode = res.rows[0].data;
            console.log(`[ACTION ${actionExecutionId}] Latest scan fetched: "${textToEncode}"`);
          } else {
            textToEncode = randomUUID();
            console.log(`[ACTION ${actionExecutionId}] No scan data, generated UUID: "${textToEncode}"`);
          }
        } finally {
          client.release();
        }
      } catch (dbError: any) {
        console.error(`[ACTION ${actionExecutionId}] Database error:`, dbError.message);
        textToEncode = randomUUID();
      }
      break;
    default:
      console.log(`[ACTION ${actionExecutionId}] Unknown or missing intent: ${intent}`);
      return json({ 
        error: `不支援的操作: ${intent || '未指定'}`, 
        qrCodeDataUrl: null, 
        sourceText: null, 
        intent, 
        timestamp: currentTimestamp 
      } as QrCodeResponse, { status: 400 });
  }

  const sizeValue = formData.get("size") || "256";
  const errorCorrectionLevelValue = formData.get("errorCorrectionLevel") || "H";
  console.log(`[ACTION ${actionExecutionId}] QR Params: size=${sizeValue}, ecLevel=${errorCorrectionLevelValue}`);

  try {
    const qrCodeDataUrl = await QRCode.toDataURL(textToEncode, {
      errorCorrectionLevel: errorCorrectionLevelValue as QRCode.QRCodeErrorCorrectionLevel,
      width: parseInt(sizeValue as string, 10),
      margin: 2,
      color: { dark: "#0F172A", light: "#FFFFFF" }
    });
    console.log(`[ACTION ${actionExecutionId}] QR Code generated successfully for: "${textToEncode}"`);
    return json({ qrCodeDataUrl, error: null, sourceText: textToEncode, intent, timestamp: currentTimestamp } as QrCodeResponse);
  } catch (err: any) {
    console.error(`[ACTION ${actionExecutionId}] QR Code generation error:`, err.message);
    return json({ error: "產生 QR Code 時發生錯誤。", qrCodeDataUrl: null, sourceText: textToEncode, intent, timestamp: currentTimestamp } as QrCodeResponse, { status: 500 });
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
  const [customText, setCustomText] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const submit = useSubmit();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    addUiDebugMessage(`Initial loaderData received: intent=${initialLoaderData.intent}, ts=${initialLoaderData.timestamp}, text="${initialLoaderData.sourceText?.substring(0,30)}..."`);
    setCurrentDisplayData(initialLoaderData);
  }, [initialLoaderData, addUiDebugMessage]);

  useEffect(() => {
    if (actionData) {
      addUiDebugMessage(`Action data received: intent=${actionData.intent}, ts=${actionData.timestamp}, text="${actionData.sourceText?.substring(0,30)}..."`);
      if (!currentDisplayData.timestamp || (actionData.timestamp && actionData.timestamp > currentDisplayData.timestamp)) {
        addUiDebugMessage(`Updating display with actionData (ts: ${actionData.timestamp})`);
        setCurrentDisplayData(actionData);
      } else {
        addUiDebugMessage(`Action data (ts: ${actionData.timestamp}) not newer than current (ts: ${currentDisplayData.timestamp}). No UI update from actionData.`);
      }
    }
  }, [actionData, addUiDebugMessage, currentDisplayData.timestamp]);

  // Auto-refresh functionality
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        addUiDebugMessage("Auto-refresh triggered");
        const formData = new FormData();
        formData.append("intent", "update-latest-scan");
        formData.append("size", qrSize);
        formData.append("errorCorrectionLevel", errorCorrection);
        submit(formData, { method: "post" });
      }, 3000); // 3 seconds
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, qrSize, errorCorrection, submit, addUiDebugMessage]);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      addUiDebugMessage(`Storage event: key=${event.key}, newValue=${event.newValue?.substring(0,50)}, oldValue=${event.oldValue?.substring(0,50)}`);
      if (event.key === 'latestScannedDataTimestamp' || event.key === 'latestScannedDataItem') {
        const newTimestamp = event.storageArea?.getItem('latestScannedDataTimestamp');
        const lastRevalidated = localStorage.getItem('lastRevalidatedTimestamp');
        addUiDebugMessage(`Relevant storage change. NewTS: ${newTimestamp}, LastRevalidatedTS: ${lastRevalidated}`);

        if (newTimestamp && newTimestamp !== lastRevalidated) {
          addUiDebugMessage("Revalidating loader data due to new storage event...");
          revalidator.revalidate();
          localStorage.setItem('lastRevalidatedTimestamp', newTimestamp);
        } else {
          addUiDebugMessage("Storage event for same timestamp or no new timestamp, no revalidation.");
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    addUiDebugMessage("Storage event listener added.");

    const latestStoredTimestamp = localStorage.getItem('latestScannedDataTimestamp');
    if (latestStoredTimestamp) {
      addUiDebugMessage(`Initial mount check - localStorage latestScannedDataTimestamp: ${latestStoredTimestamp}, loaderData ts: ${initialLoaderData.timestamp}, intent: ${initialLoaderData.intent}`);
      if (initialLoaderData.intent !== "loader-fetch-latest" || (initialLoaderData.timestamp && parseInt(latestStoredTimestamp, 10) > initialLoaderData.timestamp)) {
        if (latestStoredTimestamp !== localStorage.getItem('lastRevalidatedTimestamp')) {
          addUiDebugMessage("Found newer data in localStorage on initial mount, revalidating.");
          revalidator.revalidate();
          localStorage.setItem('lastRevalidatedTimestamp', latestStoredTimestamp);
        } else {
          addUiDebugMessage("Newer data in localStorage on mount, but already revalidated for this timestamp.");
        }
      }
    }

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      addUiDebugMessage("Storage event listener removed.");
    };
  }, [revalidator, initialLoaderData.timestamp, initialLoaderData.intent, addUiDebugMessage]);

  const handleGenerateNewUuid = () => {
    addUiDebugMessage("Button click: handleGenerateNewUuid");
    const formData = new FormData();
    formData.append("intent", "generate-uuid-via-action");
    formData.append("size", qrSize);
    formData.append("errorCorrectionLevel", errorCorrection);
    submit(formData, { method: "post" });
  };

  const handleUpdateLatestScan = () => {
    addUiDebugMessage("Button click: handleUpdateLatestScan");
    const formData = new FormData();
    formData.append("intent", "update-latest-scan");
    formData.append("size", qrSize);
    formData.append("errorCorrectionLevel", errorCorrection);
    submit(formData, { method: "post" });
  };

  const handleGenerateCustom = () => {
    addUiDebugMessage(`Button click: handleGenerateCustom with text: "${customText}"`);
    const formData = new FormData();
    formData.append("intent", "generate-custom-text");
    formData.append("customText", customText);
    formData.append("size", qrSize);
    formData.append("errorCorrectionLevel", errorCorrection);
    submit(formData, { method: "post" });
  };

  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700 text-gray-100 p-6 font-sans">
      <div className="bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-lg">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 mb-2">
            QR Code 產生器
          </h1>
          <p className="text-slate-400">
            {currentDisplayData?.intent === "loader-initial-uuid" || currentDisplayData?.intent?.includes("fallback-uuid")
              ? "初始顯示 UUID QR Code。最新掃描資料將自動更新於此。"
              : currentDisplayData?.intent === "loader-fetch-latest"
              ? "顯示最新掃描的 QR Code。"
              : currentDisplayData?.intent === "generate-uuid-via-action"
              ? "顯示新產生的 UUID QR Code。"
              : currentDisplayData?.intent === "generate-custom-text"
              ? "顯示自訂文字的 QR Code。"
              : "掃描資料將更新於此，或點擊按鈕產生新的 QR Code。"
            }
          </p>

          {/* Status indicators */}
          <div className="flex justify-center items-center gap-4 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-slate-400">從最新掃描資料重新產生的 QR Code。</span>
            </div>
          </div>

          {/* Auto-refresh toggle */}
          <div className="flex justify-center items-center gap-2 mt-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
              <path d="M3 21v-5h5"/>
            </svg>
            <span className="text-blue-400 text-sm">跨設備自動更新已啟用 (每 3 秒檢查)</span>
          </div>

          <div className="mt-4 flex justify-center items-center gap-3">
            <span className="text-slate-300">跨設備自動更新:</span>
            <label className="relative inline-block w-12 h-6">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="sr-only"
              />
              <div className={`block w-12 h-6 rounded-full ${autoRefresh ? 'bg-green-500' : 'bg-gray-600'} transition-colors`}>
                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${autoRefresh ? 'transform translate-x-6' : ''}`}></div>
              </div>
            </label>
            <span className="text-sm text-slate-400">{autoRefresh ? '開啟' : '關閉'}</span>
          </div>
        </header>

        {/* UI Debug Log Display */}
        {debugMessages.length > 0 && (
          <div className="w-full p-2 mb-4 bg-slate-950 border border-slate-700 text-slate-400 text-xs rounded-md shadow-inner max-h-32 overflow-y-auto font-mono">
            <p className="font-semibold text-slate-300 mb-1 border-b border-slate-700 pb-1">客戶端日誌 (Client Log):</p>
            {debugMessages.map((msg, index) => (
              <div key={index} className="whitespace-pre-wrap break-all py-0.5 even:bg-slate-900 px-1">{msg.substring(msg.indexOf(']') + 2)}</div>
            ))}
          </div>
        )}

        <div className="space-y-6">
          {/* Size and Error Correction Settings */}
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

          {/* Custom Text Input */}
          <div>
            <label htmlFor="custom-text" className="block text-sm font-medium text-slate-300 mb-1">
              自訂文字或網址:
            </label>
            <div className="flex gap-2">
              <input
                id="custom-text"
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="輸入要產生 QR Code 的文字..."
                className="flex-1 p-3 bg-slate-700 border border-slate-600 rounded-md text-slate-200 placeholder-slate-400 focus:ring-purple-500 focus:border-purple-500"
              />
              <button
                type="button"
                onClick={handleGenerateCustom}
                disabled={!customText.trim()}
                className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-orange-500 transition-all duration-150 ease-in-out active:transform active:scale-95"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-search">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={handleUpdateLatestScan}
              className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold py-3 px-4 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-blue-500 transition-all duration-150 ease-in-out active:transform active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-refresh-cw inline-block mr-1 align-middle">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                <path d="M3 21v-5h5"/>
              </svg>
              更新最新掃描
            </button>

            <button
              type="button"
              onClick={handleGenerateNewUuid}
              className="bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-semibold py-3 px-4 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-cyan-500 transition-all duration-150 ease-in-out active:transform active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus inline-block mr-1 align-middle">
                <path d="M5 12h14"/>
                <path d="M12 5v14"/>
              </svg>
              產生新 UUID
            </button>

            <button
              type="button"
              onClick={handleGenerateCustom}
              className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-semibold py-3 px-4 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-orange-500 transition-all duration-150 ease-in-out active:transform active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-search inline-block mr-1 align-middle">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
              測試輸詢
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
            <h3 className="text-xl font-semibold text-slate-100 mb-2">目前 QR Code：</h3>
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
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-download mr-2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" x2="12" y1="15" y2="3"/>
              </svg>
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