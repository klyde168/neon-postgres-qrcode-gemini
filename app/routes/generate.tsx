// app/routes/generate.tsx
import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { json, useLoaderData } from '@remix-run/react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Link } from '@remix-run/react';

export const meta: MetaFunction = () => {
  return [
    { title: '生成 QR Code' },
    { name: 'description', content: '每 2 秒自動生成包含當前時間（UTC+08:00）的 QR Code' },
  ];
};

export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  console.log('[GENERATE LOADER] Generating initial QR code with timestamp');
  const textToEncode = Date.now().toString(); // 使用毫秒時間戳作為 QR Code 內容
  const currentTimestamp = Date.now();
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(textToEncode, {
      errorCorrectionLevel: 'H',
      width: 256,
      margin: 2,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    });
    console.log('[GENERATE LOADER] QR code generated successfully');
    return json({
      qrCodeDataUrl,
      error: null,
      sourceText: textToEncode,
      timestamp: currentTimestamp,
    });
  } catch (error: any) {
    console.error('[GENERATE LOADER] Error generating QR code:', error.message);
    return json(
      {
        qrCodeDataUrl: null,
        error: `生成 QR Code 時發生錯誤: ${error.message}`,
        sourceText: null,
        timestamp: currentTimestamp,
      },
      { status: 500 },
    );
  }
}

export default function GeneratePage() {
  const loaderData = useLoaderData<typeof loader>();
  const [latestData, setLatestData] = useState<{
    qrCodeDataUrl: string | null;
    sourceText: string | null;
    error: string | null;
    timestamp: number | null;
  }>({
    qrCodeDataUrl: loaderData.qrCodeDataUrl,
    sourceText: loaderData.sourceText,
    error: loaderData.error,
    timestamp: loaderData.timestamp,
  });

  // 每 2 秒自動生成新的 QR Code
  useEffect(() => {
    const generateNewQrCode = async () => {
      const textToEncode = Date.now().toString(); // 使用毫秒時間戳
      const currentTimestamp = Date.now();
      try {
        const qrCodeDataUrl = await QRCode.toDataURL(textToEncode, {
          errorCorrectionLevel: 'H',
          width: 256,
          margin: 2,
          color: { dark: '#0F172A', light: '#FFFFFF' },
        });
        console.log('[GENERATE PAGE] New QR code generated successfully');
        setLatestData({
          qrCodeDataUrl,
          sourceText: textToEncode,
          error: null,
          timestamp: currentTimestamp,
        });
      } catch (error: any) {
        console.error('[GENERATE PAGE] Error generating QR code:', error.message);
        setLatestData({
          qrCodeDataUrl: null,
          sourceText: null,
          error: `生成 QR Code 時發生錯誤: ${error.message}`,
          timestamp: currentTimestamp,
        });
      }
    };

    // 立即生成一次
    generateNewQrCode();

    // 設置每 2 秒生成一次
    const intervalId = setInterval(generateNewQrCode, 2000);

    // 清理間隔計時器
    return () => {
      console.log('[GENERATE PAGE] Cleaning up interval');
      clearInterval(intervalId);
    };
  }, []);

  // 監聽 storage 事件（保留與掃描頁面的互動）
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'latestScannedDataTimestamp' && event.newValue) {
        console.log('[GENERATE PAGE] Storage event detected:', event.newValue);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // 格式化時間戳為 UTC+08:00
  const formatTimestamp = (timestamp: number | null): string => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // 手動生成新的 QR Code
  const handleManualGenerate = async () => {
    const textToEncode = Date.now().toString();
    const currentTimestamp = Date.now();
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(textToEncode, {
        errorCorrectionLevel: 'H',
        width: 256,
        margin: 2,
        color: { dark: '#0F172A', light: '#FFFFFF' },
      });
      console.log('[GENERATE PAGE] Manual QR code generated successfully');
      setLatestData({
        qrCodeDataUrl,
        sourceText: textToEncode,
        error: null,
        timestamp: currentTimestamp,
      });
    } catch (error: any) {
      console.error('[GENERATE PAGE] Error generating manual QR code:', error.message);
      setLatestData({
        qrCodeDataUrl: null,
        sourceText: null,
        error: `生成 QR Code 時發生錯誤: ${error.message}`,
        timestamp: currentTimestamp,
      });
    }
  };

  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700 text-gray-100 p-6 font-sans">
      <div className="bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-lg">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-400 mb-2">
            QR Code 生成器
          </h1>
          <p className="text-slate-400">每 2 秒自動生成包含當前時間（UTC+08:00）的 QR Code</p>
        </header>

        <div className="flex flex-col items-center space-y-4">
          <button
            onClick={handleManualGenerate}
            className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-semibold py-3 px-8 rounded-lg shadow-md"
          >
            手動生成新的 QR Code
          </button>
        </div>

        {latestData.error && (
          <div className="mt-4 p-4 bg-red-700 bg-opacity-50 border border-red-500 text-red-300 rounded-lg text-center w-full max-w-sm">
            <p className="font-semibold">錯誤：</p>
            <p>{latestData.error}</p>
          </div>
        )}

        {latestData.qrCodeDataUrl && latestData.sourceText && (
          <div className="mt-6 flex flex-col items-center space-y-4 w-full max-w-sm">
            <img
              src={latestData.qrCodeDataUrl}
              alt="生成的 QR Code"
              className="w-64 h-64 rounded-lg shadow-lg border-2 border-slate-600"
            />
            <div className="p-4 bg-slate-700 rounded-lg shadow-inner w-full text-center">
              <p className="text-slate-400">生成時間（UTC+08:00）：</p>
              <p className="text-lg text-purple-300 break-all">{formatTimestamp(latestData.timestamp)}</p>
              <p className="text-slate-400 mt-2">時間戳（毫秒）：</p>
              <p className="text-lg text-purple-300 break-all">{latestData.sourceText}</p>
            </div>
            <button
              onClick={() => {
                if (navigator.clipboard && latestData.sourceText) {
                  navigator.clipboard.writeText(latestData.sourceText).then(() => {
                    console.log('[GENERATE PAGE] Copied to clipboard:', latestData.sourceText);
                    alert('已複製時間戳到剪貼簿！');
                  }).catch(err => {
                    console.error('[GENERATE PAGE] Clipboard copy failed:', err);
                    alert('複製失敗');
                  });
                }
              }}
              className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md"
            >
              複製時間戳
            </button>
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            to="/scan"
            className="inline-block text-purple-400 hover:text-purple-300 hover:underline transition-colors"
          >
            前往掃描 QR Code →
          </Link>
        </div>
      </div>

      <footer className="mt-12 text-center text-slate-500 text-sm">
        <p>
          使用{' '}
          <a href="https://remix.run" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
            Remix
          </a>{' '}
          和{' '}
          <a href="https://tailwindcss.com" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">
            Tailwind CSS
          </a>{' '}
          製作。
        </p>
      </footer>
    </div>
  );
}