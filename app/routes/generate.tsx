// app/routes/generate.tsx (Updated with WebSocket support)
import type { MetaFunction, ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Link, useActionData, json, useSubmit, useLoaderData } from "@remix-run/react";
import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { randomUUID } from "node:crypto";
import { pool } from "~/utils/db.server";
import { useWebSocket } from "~/hooks/useWebSocket";

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
};

export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  const loaderExecutionId = randomUUID().substring(0, 8);
  console.log(`[LOADER ${loaderExecutionId}] Initiated.`);
  let textToEncode: string | null = null;
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
        console.log(`[LOADER ${loaderExecutionId}] Fetched latest scanned data: "${textToEncode}"`);
      } else {
        textToEncode = randomUUID();
        intent = "loader-initial-uuid";
        console.log(`[LOADER ${loaderExecutionId}] No scanned data in DB, generated UUID: "${textToEncode}"`);
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
  let textToEncode: string | null = null;
  const currentTimestamp = Date.now();

  if (intent === "generate-uuid-via-action") {
    textToEncode = randomUUID();
    console.log(`[ACTION ${actionExecutionId}] New UUID generated: "${textToEncode}"`);
  } else {
    return json({ error: "無效的操作。", qrCodeDataUrl: null, sourceText: null, intent, timestamp: currentTimestamp } as QrCodeResponse, { status: 400 });
  }

  const sizeValue = formData.get("size") || "256";
  const errorCorrectionLevelValue = formData.get("errorCorrectionLevel") || "H";

  try {
    const qrCodeDataUrl = await QRCode.toDataURL(textToEncode, {
      errorCorrectionLevel: errorCorrectionLevelValue as QRCode.QRCodeErrorCorrectionLevel,
      width: parseInt(sizeValue as string, 10),
      margin: 2,
      color: { dark: "#0F172A", light: "#FFFFFF" }
    });
    return json({ qrCodeDataUrl, error: null, sourceText: textToEncode, intent, timestamp: currentTimestamp } as QrCodeResponse);
  } catch (err: any) {
    console.error(`[ACTION ${actionExecutionId}] QR Code generation error:`, err.message);
    return json({ error: "產生 QR Code 時發生錯誤。", qrCodeDataUrl: null, sourceText: textToEncode, intent, timestamp: currentTimestamp } as QrCodeResponse, { status: 500 });
  }
}

export default function GeneratePage() {
  const initialLoaderData = useLoaderData<QrCodeResponse>();
  const actionData = useActionData<QrCodeResponse>();
  const [debugMessages, setDebugMessages] = useState<string[]>([]);
  const addUiDebugMessage = useCallback(getUiLogger(setDebugMessages), []);

  const [currentDisplayData, setCurrentDisplayData] = useState<QrCodeResponse>(initialLoaderData);
  const [qrSize, setQrSize] = useState("256");
  const [errorCorrection, setErrorCorrection] = useState<QRCode.QRCodeErrorCorrectionLevel>("H");
  const imgRef = useRef<HTMLImageElement>(null);
  const submit = useSubmit();

  // WebSocket connection
  const { status: wsStatus, lastMessage, sendMessage } = useWebSocket();

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage?.type === 'qr_scanned' && lastMessage.data) {
      addUiDebugMessage(`WebSocket: Received scanned QR data: ${lastMessage.data.content?.substring(0, 30)}...`);
      
      // Generate new QR code with scanned data
      const generateQRForScannedData = async () => {
        try {
          const qrCodeDataUrl = await QRCode.toDataURL(lastMessage.data.content, {
            errorCorrectionLevel: errorCorrection,
            width: parseInt(qrSize, 10),
            margin: 2,
            color: { dark: "#0F172A", light: "#FFFFFF" }
          });

          const newDisplayData: QrCodeResponse = {
            qrCodeDataUrl,
            sourceText: lastMessage.data.content,
            intent: "websocket-scanned-data",
            timestamp: Date.now(),
            error: null
          };

          setCurrentDisplayData(newDisplayData);
          addUiDebugMessage(`WebSocket: Updated display with scanned data QR code`);
        } catch (error) {
          addUiDebugMessage(`WebSocket: Failed to generate QR for scanned data: ${error}`, true);
        }
      };

      generateQRForScannedData();
    } else if (lastMessage?.type === 'connection') {
      addUiDebugMessage(`WebSocket: ${lastMessage.message}`);
    }
  }, [lastMessage, errorCorrection, qrSize, addUiDebugMessage]);

  useEffect(() => {
    addUiDebugMessage(`WebSocket status: ${wsStatus}`);
  }, [wsStatus, addUiDebugMessage]);

  useEffect(() => {
    addUiDebugMessage(`Initial loaderData received: intent=${initialLoaderData.intent}, ts=${initialLoaderData.timestamp}`);
    setCurrentDisplayData(initialLoaderData);
  }, [initialLoaderData, addUiDebugMessage]);

  useEffect(() => {
    if (actionData) {
      addUiDebugMessage(`Action data received: intent=${actionData.intent}, ts=${actionData.timestamp}`);
      if (!currentDisplayData.timestamp || (actionData.timestamp && actionData.timestamp > currentDisplayData.timestamp)) {
        addUiDebugMessage(`Updating display with actionData (ts: ${actionData.timestamp})`);
        setCurrentDisplayData(actionData);
      }
    }
  }, [actionData, addUiDebugMessage, currentDisplayData.timestamp]);

  const handleGenerateNewUuid = () => {
    addUiDebugMessage("Button click: handleGenerateNewUuid");
    const formData = new FormData();
    formData.append("intent", "generate-uuid-via-action");
    formData.append("size", qrSize);
    formData.append("errorCorrectionLevel", errorCorrection);
    submit(formData, { method: "post" });
  };

  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700 text-gray-100 p-6 font-sans">
      <div className="bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-lg">
        {/* WebSocket Status Indicator */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              wsStatus === 'connected' ? 'bg-green-500' : 
              wsStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 
              'bg-red-500'
            }`}></div>
            <span className="text-sm text-slate-400">
              WebSocket: {wsStatus === 'connected' ? '已連接' : wsStatus === 'connecting' ? '連接中...' : '未連接'}
            </span>
          </div>
        </div>

        {/* Debug Log */}
        {debugMessages.length > 0 && (
          <div className="w-full p-2 mb-4 bg-slate-950 border border-slate-700 text-slate-400 text-xs rounded-md shadow-inner max-h-32 overflow-y-auto font-mono">
            <p className="font-semibold text-slate-300 mb-1 border-b border-slate-700 pb-1">系統日誌:</p>
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
            {currentDisplayData?.intent === "websocket-scanned-data"
              ? "顯示最新掃描的 QR Code (即時更新)"
              : currentDisplayData?.intent === "loader-initial-uuid" || currentDisplayData?.intent?.includes("fallback-uuid")
              ? "初始顯示 UUID QR Code"
              : currentDisplayData?.intent === "loader-fetch-latest"
              ? "顯示最新掃描的 QR Code"
              : currentDisplayData?.intent === "generate-uuid-via-action"
              ? "顯示新產生的 UUID QR Code"
              : "掃描資料將即時更新於此"
            }
          </p>
        </header>

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

          <button
            type="button"
            onClick={handleGenerateNewUuid}
            className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-semibold py-3 px-6 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-cyan-500 transition-all duration-150 ease-in-out active:transform active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-refresh-cw inline-block mr-2 align-middle">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
              <path d="M3 21v-5h5"/>
            </svg>
            產生新的 UUID QR Code
          </button>
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
              <p className="text-xs text-slate-400 mb-3 break-all max-w-xs mx-auto">
                內容: {currentDisplayData.sourceText}
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