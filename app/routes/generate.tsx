// app/routes/generate.tsx
import { useState, useEffect, useCallback } from 'react';
import { Link } from '@remix-run/react';
import QRCode from 'qrcode';
// import { v4 as uuidv4 } from 'uuid'; // 如果總是使用固定 UUID，可以不用這個

export const meta = () => {
  return [
    { title: "產生 QR Code - Remix QR Code 工具" },
    { name: "description", content: "產生文字或特定 UUID 的 QR Code" },
  ];
};

export default function GeneratePage() {
  const specificUuid = "60303f1c-02dd-4ffe-8fd9-a013313e26af"; // 您指定的 UUID
  const [inputValue, setInputValue] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [currentUuidForDisplay, setCurrentUuidForDisplay] = useState(''); // 用於顯示的 UUID
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 生成 QR Code 的通用函數
  const generateQrCode = useCallback(async (textToEncode: string) => {
    // 增強檢查：確保 textToEncode 是有效的字串
    if (typeof textToEncode !== 'string' || !textToEncode.trim()) {
      setQrCodeUrl('');
      setError('輸入內容無效，無法產生 QR Code。');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const url = await QRCode.toDataURL(textToEncode, { // textToEncode 在這裡一定是 string
        width: 256,
        margin: 2,
        errorCorrectionLevel: 'H'
      });
      setQrCodeUrl(url);
    } catch (err) {
      console.error('QR Code 產生失敗:', err);
      setError('無法產生 QR Code，請稍後再試。');
      setQrCodeUrl('');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setCurrentUuidForDisplay(specificUuid);
    setInputValue(specificUuid);
    generateQrCode(specificUuid);
  }, [generateQrCode, specificUuid]);

  const handleManualGenerate = () => {
    // inputValue 來自 useState('')，所以它一定是 string
    if (!inputValue.trim()) {
      setError('請輸入有效的文字或網址。');
      setQrCodeUrl('');
      return;
    }
    setCurrentUuidForDisplay(inputValue); // 更新顯示的內容來源
    generateQrCode(inputValue);
  };

  const handleRegenerateUuid = () => {
    // specificUuid 是字串常量
    setCurrentUuidForDisplay(specificUuid);
    setInputValue(specificUuid);
    generateQrCode(specificUuid);
    // 這裡可以使用更美觀的提示框代替 alert
    // alert("已重設為預設 UUID 並重新產生 QR Code。");
    setError("已重設為預設 UUID 並重新產生 QR Code。"); // 使用 setError 來顯示提示
    // 短暫顯示後清除提示
    setTimeout(() => setError(null), 3000);

  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value; // e.target.value 是 string
    setInputValue(value);
    if (!value.trim()) {
      setQrCodeUrl('');
      setError(null);
      if (isLoading) {
        setIsLoading(false);
      }
    }
  };

  // 您的錯誤訊息指出在第 157 行，您呼叫了 QRCode.toDataURL(downloadFileName, ...)
  // 其中 downloadFileName 的類型是 string | null。
  // 請檢查您在該行傳遞給 QRCode.toDataURL 的第一個參數。
  // 它應該是實際要編碼的內容 (例如 inputValue)，而不是檔名。
  // 並且在使用前，需要確保它不是 null 或僅包含空白的字串。
  // 例如：
  // const content = inputValue; // 或其他包含 QR 內容的變數
  // if (content && content.trim()) {
  //   const url = await QRCode.toDataURL(content, options);
  // } else {
  //   // 處理錯誤
  // }
  // 下載連結的 href 應該使用已產生的 qrCodeUrl，download 屬性才使用檔名。

  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700 text-gray-100 p-4 sm:p-6 font-sans">
      <div className="bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-lg">
        <header className="mb-6 sm:mb-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-orange-400 mb-2">
            QR Code 產生器
          </h1>
          <p className="text-slate-400 text-sm sm:text-base">
            輸入文字、網址，或使用預設的 UUID 來建立您的 QR Code。
          </p>
        </header>

        <div className="space-y-6">
          <div>
            <label htmlFor="qr-text" className="block text-sm font-medium text-slate-300 mb-1">
              內容 (文字、網址或 UUID)：
            </label>
            <input
              type="text"
              id="qr-text"
              value={inputValue}
              onChange={handleInputChange}
              className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
              placeholder="輸入內容或點擊下方按鈕"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={handleManualGenerate}
              disabled={isLoading || !inputValue.trim()}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-pink-500 transition-all duration-150 ease-in-out disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-qr-code mr-2"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16h.01"/><path d="M16 12h.01"/><path d="M21 12h.01"/></svg>
              從輸入框內容產生
            </button>
            <button
              onClick={handleRegenerateUuid}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white font-semibold py-2.5 px-5 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-cyan-400 transition-all duration-150 ease-in-out disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center"
            >
             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-refresh-cw mr-2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M21 21v-5h-5"/></svg>
              重設為預設 UUID
            </button>
          </div>
          {currentUuidForDisplay && !isLoading && inputValue === currentUuidForDisplay && (
            <p className="text-xs text-slate-400 text-center break-all px-2">
              目前 QR Code 內容: {currentUuidForDisplay}
            </p>
          )}

          {isLoading && (
            <div className="text-center py-4 flex flex-col items-center justify-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
              <p className="text-slate-400 mt-2 text-sm">QR Code 產生中...</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="mt-4 p-3 bg-red-700 bg-opacity-40 border border-red-500 text-red-300 rounded-lg text-center text-sm">
              <p>{error}</p>
            </div>
          )}

          {qrCodeUrl && !isLoading && (
            <div className="mt-6 p-4 bg-slate-700 rounded-lg shadow-inner flex flex-col items-center space-y-4">
              <img
                src={qrCodeUrl}
                alt="產生的 QR Code"
                className="border-4 border-white rounded-md max-w-full h-auto"
                style={{ imageRendering: 'pixelated' }}
              />
              <a
                href={qrCodeUrl}
                download={`${inputValue.substring(0, 30).replace(/[^a-z0-9_.-]/gi, '_') || 'qrcode'}.png`}
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md shadow-md hover:shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-700 focus:ring-green-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-download mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                下載 QR Code
              </a>
            </div>
          )}
        </div>

        <footer className="mt-8 sm:mt-10 text-center">
          <Link
            to="/"
            className="text-purple-400 hover:text-purple-300 hover:underline transition-colors text-sm"
          >
            &larr; 返回首頁
          </Link>
        </footer>
      </div>
    </div>
  );
}
