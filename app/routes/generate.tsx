// app/routes/generate.tsx
import type { MetaFunction, ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Link, useActionData, json, useSubmit, useLoaderData, useRevalidator } from "@remix-run/react";
import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { randomUUID } from "node:crypto";
import { pool } from "~/utils/db.server";

// Helper for client-side logging
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
  latestScanId?: number;
};

type SSEStatus = "disconnected" | "connecting" | "connected" | "error";

export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  const loaderExecutionId = randomUUID().substring(0, 8);
  console.log(`[LOADER ${loaderExecutionId}] Initiated.`);
  
  let textToEncode: string | null = null;
  let errorMsg: string | null = null;
  let intent = "loader-fetch-latest";
  let latestScanId: number | undefined = undefined;
  const currentTimestamp = Date.now();

  try {
    const client = await pool.connect();
    try {
      const latestScanQuery = 'SELECT id, data, scanned_at FROM scanned_data ORDER BY id DESC LIMIT 1';
      const res = await client.query(latestScanQuery);
      if (res.rows.length > 0 && res.rows[0].data) {
        textToEncode = res.rows[0].data;
        latestScanId = res.rows[0].id;
        console.log(`[LOADER ${loaderExecutionId}] Fetched latest scanned data: "${textToEncode}" (ID: ${latestScanId})`);
      } else {
        textToEncode = randomUUID();
        intent = "loader-initial-uuid";
        console.log(`[LOADER ${loaderExecutionId}] No scanned data, generated UUID: "${textToEncode}"`);
      }
    } finally {
      client.release();
    }
  } catch (dbError: any) {
    console.error(`[LOADER ${loaderExecutionId}] Database error:`, dbError.message);
    errorMsg = "讀取最新掃描資料時發生錯誤。";
    textToEncode = randomUUID();
    intent = "loader-db-error-fallback-uuid";
  }

  if (!textToEncode) {
    textToEncode = randomUUID();
    intent = "loader-final-fallback-uuid";
  }

  try {
    const qrCodeDataUrl = await QRCode.toDataURL(textToEncode, {
      errorCorrectionLevel: "H", width: 256, margin: 2,
      color: { dark: "#0F172A", light: "#FFFFFF" }
    });
    
    return json({ 
      qrCodeDataUrl, 
      error: errorMsg, 
      sourceText: textToEncode, 
      intent, 
      timestamp: currentTimestamp,
      latestScanId 
    } as QrCodeResponse);
  } catch (qrErr: any) {
    console.error(`[LOADER ${loaderExecutionId}] QR Code generation error:`, qrErr.message);
    return json({ 
      error: `產生 QR Code 失敗: ${errorMsg || qrErr.message || '未知錯誤'}`, 
      qrCodeDataUrl: null, 
      sourceText: textToEncode, 
      intent, 
      timestamp: currentTimestamp,
      latestScanId 
    } as QrCodeResponse, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  const actionExecutionId = randomUUID().substring(0,8);
  const formData = await request.formData();
  const intent = formData.get("intent") as string | null;
  const currentTimestamp = Date.now();

  if (intent !== "generate-uuid-via-action") {
    return json({ 
      error: "無效的操作。", 
      qrCodeDataUrl: null, 
      sourceText: null, 
      intent, 
      timestamp: currentTimestamp 
    } as QrCodeResponse, { status: 400 });
  }

  const textToEncode = randomUUID();
  const sizeValue = formData.get("size") || "256";
  const errorCorrectionLevelValue = formData.get("errorCorrectionLevel") || "H";

  try {
    const qrCodeDataUrl = await QRCode.toDataURL(textToEncode, {
      errorCorrectionLevel: errorCorrectionLevelValue as QRCode.QRCodeErrorCorrectionLevel,
      width: parseInt(sizeValue as string, 10),
      margin: 2,
      color: { dark: "#0F172A", light: "#FFFFFF" }
    });
    
    console.log(`[ACTION ${actionExecutionId}] Generated UUID QR Code: "${textToEncode}"`);
    return json({ 
      qrCodeDataUrl, 
      error: null, 
      sourceText: textToEncode, 
      intent, 
      timestamp: currentTimestamp 
    } as QrCodeResponse);
  } catch (err: any) {
    console.error(`[ACTION ${actionExecutionId}] QR Code generation error:`, err.message);
    return json({ 
      error: "產生 QR Code 時發生錯誤。", 
      qrCodeDataUrl: null, 
      sourceText: textToEncode, 
      intent, 
      timestamp: currentTimestamp 
    } as QrCodeResponse, { status: 500 });
  }
}

export default function GeneratePage() {
  const initialLoaderData = useLoaderData<QrCodeResponse>();
  const actionData = useActionData<QrCodeResponse>();
  const revalidator = useRevalidator();
  const submit = useSubmit();
  
  const [debugMessages, setDebugMessages] = useState<string[]>([]);
  const addUiDebugMessage = useCallback(getUiLogger(setDebugMessages), []);
  
  const [currentDisplayData, setCurrentDisplayData] = useState<QrCodeResponse>(initialLoaderData);
  const [qrSize, setQrSize] = useState("256");
  const [errorCorrection, setErrorCorrection] = useState<QRCode.QRCodeErrorCorrectionLevel>("H");
  const [useSSE, setUseSSE] = useState(false);
  const [sseStatus, setSSEStatus] = useState<SSEStatus>("disconnected");
  const [showDebugLog, setShowDebugLog] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  const lastScanIdRef = useRef<number | undefined>(initialLoaderData.latestScanId);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const maxReconnectAttempts = 3;
  const reconnectInterval = 3000;

  // Generate QR Code from text
  const generateQRCode = useCallback(async (text: string, size: number = 256, ecLevel: QRCode.QRCodeErrorCorrectionLevel = "H") => {
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(text, {
        errorCorrectionLevel: ecLevel,
        width: size,
        margin: 2,
        color: { dark: "#0F172A", light: "#FFFFFF" }
      });
      return qrCodeDataUrl;
    } catch (error) {
      addUiDebugMessage(`QR Code 產生錯誤: ${error instanceof Error ? error.message : String(error)}`, true);
      return null;
    }
  }, [addUiDebugMessage]);

  // SSE Connection Management
  const connectSSE = useCallback(() => {
    if (!useSSE) return;

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setSSEStatus("connecting");
    addUiDebugMessage("建立 SSE 連接...");

    const url = lastScanIdRef.current 
      ? `/events?lastId=${lastScanIdRef.current}`
      : "/events";

    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        addUiDebugMessage("SSE 連接已建立");
        setSSEStatus("connected");
        setReconnectAttempts(0);
      };

      eventSource.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          addUiDebugMessage(`SSE 收到訊息: ${data.type}`);

          if (data.type === "new_scan" && data.data) {
            const { id, content, scannedAt, timestamp } = data.data;
            addUiDebugMessage(`新掃描資料: ID=${id}, content="${content.substring(0,30)}..."`);
            
            // Generate new QR code with current settings
            const qrCodeDataUrl = await generateQRCode(content, parseInt(qrSize), errorCorrection);
            
            if (qrCodeDataUrl) {
              setCurrentDisplayData({
                qrCodeDataUrl,
                sourceText: content,
                intent: "sse-new-scan",
                timestamp,
                latestScanId: id,
                error: null
              });
              lastScanIdRef.current = id;
              addUiDebugMessage(`透過 SSE 更新 QR Code 顯示`);
            }
          } else if (data.type === "connected") {
            addUiDebugMessage(`SSE 服務訊息: ${data.message}`);
          }
        } catch (error) {
          addUiDebugMessage(`SSE 訊息解析錯誤: ${error instanceof Error ? error.message : String(error)}`, true);
        }
      };

      eventSource.onerror = () => {
        addUiDebugMessage("SSE 連接發生錯誤", true);
        setSSEStatus("error");
        
        // Attempt to reconnect if we haven't exceeded max attempts
        if (reconnectAttempts < maxReconnectAttempts) {
          const newAttempts = reconnectAttempts + 1;
          setReconnectAttempts(newAttempts);
          addUiDebugMessage(`準備第 ${newAttempts} 次重連 (最多 ${maxReconnectAttempts} 次)`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectSSE();
          }, reconnectInterval);
        } else {
          addUiDebugMessage(`已達最大重連次數 (${maxReconnectAttempts})`, true);
        }
      };

    } catch (error) {
      addUiDebugMessage(`建立 EventSource 失敗: ${error instanceof Error ? error.message : String(error)}`, true);
      setSSEStatus("error");
    }
  }, [useSSE, addUiDebugMessage, generateQRCode, qrSize, errorCorrection, reconnectAttempts, maxReconnectAttempts, reconnectInterval]);

  const disconnectSSE = useCallback(() => {
    addUiDebugMessage("關閉 SSE 連接");
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setReconnectAttempts(0);
    setSSEStatus("disconnected");
  }, [addUiDebugMessage]);

  const manualReconnect = useCallback(() => {
    addUiDebugMessage("手動重新連接");
    setReconnectAttempts(0);
    connectSSE();
  }, [addUiDebugMessage, connectSSE]);

  // Handle initial loader data
  useEffect(() => {
    addUiDebugMessage(`初始載入資料: intent=${initialLoaderData.intent}, scanId=${initialLoaderData.latestScanId}`);
    setCurrentDisplayData(initialLoaderData);
    lastScanIdRef.current = initialLoaderData.latestScanId;
  }, [initialLoaderData, addUiDebugMessage]);

  // Handle action data
  useEffect(() => {
    if (actionData) {
      addUiDebugMessage(`動作資料: intent=${actionData.intent}, ts=${actionData.timestamp}`);
      if (!currentDisplayData.timestamp || (actionData.timestamp && actionData.timestamp > currentDisplayData.timestamp)) {
        setCurrentDisplayData(actionData);
      }
    }
  }, [actionData, addUiDebugMessage, currentDisplayData.timestamp]);

  // SSE Management Effect
  useEffect(() => {
    if (useSSE) {
      connectSSE();
    } else {
      disconnectSSE();
    }

    return () => {
      disconnectSSE();
    };
  }, [useSSE, connectSSE, disconnectSSE]);

  // Traditional localStorage event handling (when SSE is disabled)
  useEffect(() => {
    if (useSSE) return;

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'latestScannedDataTimestamp' || event.key === 'latestScannedDataItem') {
        const newTimestamp = event.storageArea?.getItem('latestScannedDataTimestamp');
        const lastRevalidated = localStorage.getItem('lastRevalidatedTimestamp');
        
        if (newTimestamp && newTimestamp !== lastRevalidated) {
          addUiDebugMessage("透過 localStorage 事件重新載入資料");
          revalidator.revalidate();
          localStorage.setItem('lastRevalidatedTimestamp', newTimestamp);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [useSSE, revalidator, addUiDebugMessage]);

  const handleGenerateNewUuid = () => {
    const formData = new FormData();
    formData.append("intent", "generate-uuid-via-action");
    formData.append("size", qrSize);
    formData.append("errorCorrectionLevel", errorCorrection);
    submit(formData, { method: "post" });
  };

  const getSSEStatusColor = () => {
    switch (sseStatus) {
      case "connected": return "text-green-400";
      case "connecting": return "text-yellow-400";
      case "error": return "text-red-400";
      default: return "text-gray-400";
    }
  };

  const getSSEStatusText = () => {
    switch (sseStatus) {
      case "connected": return "已連接";
      case "connecting": return "連接中...";
      case "error": return "連接錯誤";
      default: return "未連接";
    }
  };

  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700 text-gray-100 p-6 font-sans">
      <div className="bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-lg">
        
        {/* Debug Log Toggle */}
        <div className="mb-4">
          <button
            onClick={() => setShowDebugLog(!showDebugLog)}
            className="text-xs text-slate-400 hover:text-slate-300 underline"
          >
            {showDebugLog ? "隱藏" : "顯示"} 除錯日誌
          </button>
        </div>

        {/* Debug Log Display */}
        {showDebugLog && debugMessages.length > 0 && (
          <div className="w-full p-2 mb-4 bg-slate-950 border border-slate-700 text-slate-400 text-xs rounded-md shadow-inner max-h-32 overflow-y-auto font-mono">
            <div className="flex justify-between items-center mb-1 border-b border-slate-700 pb-1">
              <p className="font-semibold text-slate-300">除錯日誌:</p>
              <button
                onClick={() => setDebugMessages([])}
                className="text-slate-500 hover:text-slate-300 text-xs"
              >
                清除
              </button>
            </div>
            {debugMessages.map((msg, index) => (
              <div key={index} className="whitespace-pre-wrap break-all py-0.5 even:bg-slate-900 px-1">
                {msg.substring(msg.indexOf(']') + 2)}
              </div>
            ))}
          </div>
        )}

        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 mb-2">
            QR Code 產生器
          </h1>
          <p className="text-slate-400">
            {currentDisplayData?.intent === "sse-new-scan" 
              ? "透過即時更新顯示最新掃描的 QR Code"
              : currentDisplayData?.intent === "generate-uuid-via-action"
              ? "顯示新產生的 UUID QR Code"
              : currentDisplayData?.intent === "loader-fetch-latest"
              ? "顯示最新掃描的 QR Code"
              : "顯示 QR Code，支援即時更新"}
          </p>
        </header>

        <div className="space-y-6">
          {/* SSE Toggle */}
          <div className="p-4 bg-slate-700 rounded-lg border border-slate-600">
            <div className="flex items-center justify-between mb-3">
              <label htmlFor="sse-toggle" className="flex items-center space-x-3 cursor-pointer">
                <input
                  id="sse-toggle"
                  type="checkbox"
                  checked={useSSE}
                  onChange={(e) => setUseSSE(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-slate-600 border-slate-500 rounded focus:ring-blue-500 focus:ring-2"
                />
                <div>
                  <span className="text-slate-200 font-medium">即時更新 (SSE)</span>
                  <p className="text-sm text-slate-400">啟用後將即時顯示新掃描的 QR Code</p>
                </div>
              </label>
            </div>
            
            {useSSE && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${
                      sseStatus === "connected" ? "bg-green-400" : 
                      sseStatus === "connecting" ? "bg-yellow-400 animate-pulse" : 
                      sseStatus === "error" ? "bg-red-400" : "bg-gray-400"
                    }`}></div>
                    <span className={getSSEStatusColor()}>狀態: {getSSEStatusText()}</span>
                  </div>
                  
                  {sseStatus === "error" && (
                    <button
                      onClick={manualReconnect}
                      className="text-xs bg-slate-600 hover:bg-slate-500 text-slate-200 px-2 py-1 rounded"
                    >
                      重新連接
                    </button>
                  )}
                </div>
                
                {sseStatus === "error" && (
                  <p className="text-xs text-red-400">
                    重連次數: {reconnectAttempts}/{maxReconnectAttempts}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* QR Settings */}
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

          <button
            type="button"
            onClick={handleGenerateNewUuid}
            className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-semibold py-3 px-6 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-cyan-500 transition-all duration-150 ease-in-out active:transform active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-refresh-cw inline-block mr-2 align-middle">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
              <path d="M3 21a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 16"/>
              <path d="M21 11v5h-5"/>
            </svg>
            產生新的 UUID QR Code
          </button>
        </div>

        {/* Error Display */}
        {currentDisplayData?.error && (
          <div className="mt-6 p-3 bg-red-800 bg-opacity-70 border border-red-600 text-red-200 rounded-lg text-center" role="alert">
            <p className="font-medium">錯誤：</p>
            <p>{currentDisplayData.error}</p>
          </div>
        )}

        {/* QR Code Display */}
        {currentDisplayData?.qrCodeDataUrl && (
          <div className="mt-8 text-center p-6 bg-slate-700 rounded-lg shadow-inner">
            <h3 className="text-xl font-semibold text-slate-100 mb-2">目前 QR Code：</h3>
            {currentDisplayData?.sourceText && (
              <p className="text-xs text-slate-400 mb-3 break-all max-w-xs mx-auto">
                內容: {currentDisplayData.sourceText}
                {currentDisplayData.latestScanId && (
                  <span className="block text-slate-500 mt-1">ID: {currentDisplayData.latestScanId}</span>
                )}
              </p>
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