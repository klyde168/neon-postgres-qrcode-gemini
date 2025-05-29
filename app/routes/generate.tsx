// app/routes/generate.tsx
import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { useState, useRef, useEffect } from "react";
import QRCode from "qrcode";
import { useWebSocket } from "~/hooks/useWebSocket";

export const meta: MetaFunction = () => {
  return [
    { title: "產生 QR Code - WebSocket" },
    { name: "description", content: "使用 WebSocket 即時產生 UUID QR Code" },
  ];
};

export default function GeneratePage() {
  const [qrSize, setQrSize] = useState("256");
  const [errorCorrection, setErrorCorrection] = useState<QRCode.QRCodeErrorCorrectionLevel>("H");
  const [debugMessages, setDebugMessages] = useState<string[]>([]);
  const imgRef = useRef<HTMLImageElement>(null);

  // 獲取 WebSocket URL
  const getWebSocketUrl = () => {
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}/ws`;
    }
    return 'ws://localhost:3001/ws';
  };

  // 使用 WebSocket Hook
  const websocket = useWebSocket(getWebSocketUrl());
  
  // 解構所需的屬性
  const { 
    qrData, 
    error, 
    isConnected, 
    connectionStatus, 
    generateNewUUID,
    requestGenerateUUID 
  } = websocket;

  // Debug 日誌函數
  const addDebugMessage = (message: string, isError: boolean = false) => {
    const fullMessage = `[CLIENT ${new Date().toLocaleTimeString()}.${String(new Date().getMilliseconds()).padStart(3, '0')}] ${message}`;
    if (isError) console.error(fullMessage);
    else console.log(fullMessage);
    setDebugMessages(prev => [...prev.slice(Math.max(0, prev.length - 24)), fullMessage]);
  };

  // 監聽連接狀態變化
  useEffect(() => {
    addDebugMessage(`Connection status changed: ${connectionStatus}`);
  }, [connectionStatus]);

  // 監聽 QR 資料變化
  useEffect(() => {
    if (qrData) {
      addDebugMessage(`New QR data received: ${qrData.sourceText.substring(0, 30)}...`);
    }
  }, [qrData]);

  // 監聽錯誤變化
  useEffect(() => {
    if (error) {
      addDebugMessage(`Error: ${error}`, true);
    }
  }, [error]);

  const handleGenerateNewUUID = () => {
    addDebugMessage("Button click: handleGenerateNewUUID");
    
    if (!isConnected) {
      addDebugMessage("WebSocket not connected, cannot generate UUID", true);
      return;
    }

    // 使用兩種方法都可以
    generateNewUUID({
      size: qrSize,
      errorCorrection: errorCorrection
    });
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'bg-green-600 text-green-100';
      case 'connecting':
        return 'bg-yellow-600 text-yellow-100';
      case 'error':
        return 'bg-red-600 text-red-100';
      default:
        return 'bg-gray-600 text-gray-100';
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return '已連接';
      case 'connecting':
        return '連接中...';
      case 'disconnected':
        return '未連接';
      case 'error':
        return '連接錯誤';
      default:
        return '未知狀態';
    }
  };

  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700 text-gray-100 p-6 font-sans">
      <div className="bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-lg">
        {/* Debug 日誌顯示 */}
        {debugMessages.length > 0 && (
          <div className="w-full p-2 mb-4 bg-slate-950 border border-slate-700 text-slate-400 text-xs rounded-md shadow-inner max-h-32 overflow-y-auto font-mono">
            <p className="font-semibold text-slate-300 mb-1 border-b border-slate-700 pb-1">WebSocket 日誌:</p>
            {debugMessages.map((msg, index) => (
              <div key={index} className="whitespace-pre-wrap break-all py-0.5 even:bg-slate-900 px-1">
                {msg.substring(msg.indexOf(']') + 2)}
              </div>
            ))}
          </div>
        )}

        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 mb-2">
            QR Code 產生器 (WebSocket)
          </h1>
          <p className="text-slate-400">
            使用 WebSocket 即時產生隨機 UUID QR Code
          </p>
          <div className="mt-2">
            <span className={`inline-block px-3 py-1 text-xs rounded-full ${getConnectionStatusColor()}`}>
              {getConnectionStatusText()}
            </span>
          </div>
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
            onClick={handleGenerateNewUUID}
            disabled={!isConnected}
            className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-cyan-500 transition-all duration-150 ease-in-out active:transform active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-refresh-cw inline-block mr-2 align-middle">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
              <path d="M3 21v-5h5"/>
            </svg>
            {isConnected ? '產生新的 UUID QR Code' : `等待連接... (${getConnectionStatusText()})`}
          </button>
        </div>

        {error && (
          <div className="mt-6 p-3 bg-red-800 bg-opacity-70 border border-red-600 text-red-200 rounded-lg text-center" role="alert">
            <p className="font-medium">錯誤：</p>
            <p>{error}</p>
          </div>
        )}

        {qrData && (
          <div className="mt-8 text-center p-6 bg-slate-700 rounded-lg shadow-inner">
            <h3 className="text-xl font-semibold text-slate-100 mb-2">目前 QR Code：</h3>
            <p className="text-xs text-slate-400 mb-3 break-all max-w-xs mx-auto">
              內容: {qrData.sourceText}
            </p>
            <div className="flex justify-center items-center bg-white p-2 rounded-md inline-block shadow-lg">
              <img
                ref={imgRef}
                src={qrData.qrCodeDataUrl}
                alt="產生的 QR Code"
                className="mx-auto"
              />
            </div>
            <a
              href={qrData.qrCodeDataUrl}
              download={`qrcode_${qrData.sourceText.substring(0,15).replace(/[^a-zA-Z0-9]/g, '_')}.png`}
              className="mt-6 inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-slate-700 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-download mr-2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" x2="12" y1="15" y2="3"/>
              </svg>
              下載 QR Code
            </a>
            <p className="text-xs text-slate-500 mt-2">
              生成時間: {new Date(qrData.timestamp).toLocaleString()}
            </p>
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
          、{" "}
          <a href="https://tailwindcss.com" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">
            Tailwind CSS
          </a>{" "}
          和 WebSocket 製作。
        </p>
      </footer>
    </div>
  );
}