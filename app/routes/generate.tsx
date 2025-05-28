// app/routes/generate.tsx
import type { MetaFunction, ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Link, useActionData, json, useSubmit, useLoaderData, useRevalidator } from "@remix-run/react"; // Import useRevalidator
import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { randomUUID } from "node:crypto";
import { pool } from "~/utils/db.server"; // Import the pool

export const meta: MetaFunction = () => {
  return [
    { title: "產生 QR Code" },
    { name: "description", content: "顯示最新掃描的 QR Code 或產生新的 UUID QR Code" },
  ];
};

type QrCodeResponse = {
  qrCodeDataUrl?: string | null;
  error?: string | null;
  sourceText?: string | null; // Text that was encoded
  intent?: string | null; // To differentiate loader from action, or specific actions
  timestamp?: number; // For differentiating loader/action data
};

// Loader function: Executes on initial page load and on revalidation
export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  let textToEncode: string | null = null;
  let errorMsg: string | null = null;
  let intent = "loader-fetch-latest";
  const currentTimestamp = Date.now(); // Timestamp for this loader execution

  try {
    const client = await pool.connect();
    try {
      // 嘗試獲取最新的掃描資料
      const latestScanQuery = 'SELECT data FROM scanned_data ORDER BY id DESC LIMIT 1';
      const res = await client.query(latestScanQuery);
      if (res.rows.length > 0 && res.rows[0].data) {
        textToEncode = res.rows[0].data;
        console.log(`[generate loader ${currentTimestamp}] Fetched latest scanned data:`, textToEncode);
      } else {
        // 如果資料庫為空，則產生一個 UUID
        textToEncode = randomUUID();
        intent = "loader-initial-uuid";
        console.log(`[generate loader ${currentTimestamp}] No scanned data, generated UUID:`, textToEncode);
      }
    } finally {
      client.release();
    }
  } catch (dbError) {
    console.error(`[generate loader ${currentTimestamp}] Database error:`, dbError);
    errorMsg = "讀取最新掃描資料時發生錯誤。";
    // 發生錯誤時，也產生一個 UUID 作為備用
    textToEncode = randomUUID();
    intent = "loader-db-error-fallback-uuid";
    console.log(`[generate loader ${currentTimestamp}] DB error, generated fallback UUID:`, textToEncode);
  }

  if (!textToEncode) {
      textToEncode = randomUUID();
      intent = "loader-final-fallback-uuid";
      console.log(`[generate loader ${currentTimestamp}] Final fallback UUID:`, textToEncode);
  }

  try {
    const qrCodeDataUrl = await QRCode.toDataURL(textToEncode, {
      errorCorrectionLevel: "H", // Default EC level for loader
      width: 256, // Default size for loader
      margin: 2,
      color: { dark: "#0F172A", light: "#FFFFFF" }
    });
    return json({ qrCodeDataUrl, error: errorMsg, sourceText: textToEncode, intent, timestamp: currentTimestamp } as QrCodeResponse);
  } catch (qrErr) {
    console.error(`[generate loader ${currentTimestamp}] QR Code generation error:`, qrErr);
    return json({ error: `產生 QR Code 失敗: ${errorMsg || '未知錯誤'}`, qrCodeDataUrl: null, sourceText: textToEncode, intent, timestamp: currentTimestamp } as QrCodeResponse, { status: 500 });
  }
}

// Action function: For "Generate New UUID QR Code" button
export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  const formData = await request.formData();
  const intent = formData.get("intent") as string | null;
  let textToEncode: string | null = null;
  const currentTimestamp = Date.now(); // Timestamp for this action execution

  if (intent === "generate-uuid-via-action") {
    textToEncode = randomUUID();
    console.log(`[generate action ${currentTimestamp}] New UUID generated:`, textToEncode);
  } else {
    console.log(`[generate action ${currentTimestamp}] Invalid intent:`, intent);
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
  } catch (err) {
    console.error(`[generate action ${currentTimestamp}] QR Code generation error:`, err);
    return json({ error: "產生 QR Code 時發生錯誤。", qrCodeDataUrl: null, sourceText: textToEncode, intent, timestamp: currentTimestamp } as QrCodeResponse, { status: 500 });
  }
}

export default function GeneratePage() {
  const initialLoaderData = useLoaderData<QrCodeResponse>();
  const actionData = useActionData<QrCodeResponse>();
  const revalidator = useRevalidator();

  // State to hold the data that should currently be displayed
  // Initialize with loaderData, then update if actionData is newer or present
  const [currentDisplayData, setCurrentDisplayData] = useState<QrCodeResponse>(initialLoaderData);

  const [qrSize, setQrSize] = useState("256");
  const [errorCorrection, setErrorCorrection] = useState<QRCode.QRCodeErrorCorrectionLevel>("H");
  const imgRef = useRef<HTMLImageElement>(null);
  const submit = useSubmit();

  // Effect to update display data when actionData is received (from button click)
  useEffect(() => {
    if (actionData) {
      console.log("[generate page] Action data received:", actionData);
      // Prefer actionData if it's more recent or if loaderData had an error and actionData doesn't
      if (actionData.timestamp && (!currentDisplayData.timestamp || actionData.timestamp > currentDisplayData.timestamp || currentDisplayData.error)) {
        setCurrentDisplayData(actionData);
      }
    }
  }, [actionData, currentDisplayData.timestamp, currentDisplayData.error]);

  // Effect to update display data when loaderData changes (initial load or revalidation)
  useEffect(() => {
    console.log("[generate page] Loader data received/updated:", initialLoaderData);
    // Only update from loader if there's no actionData or if loaderData is newer
    // This handles the initial load and revalidations triggered by storage events
    if (!actionData || (initialLoaderData.timestamp && (!actionData.timestamp || initialLoaderData.timestamp > actionData.timestamp))) {
        setCurrentDisplayData(initialLoaderData);
    }
  }, [initialLoaderData, actionData]);


  // Listen for localStorage changes to trigger revalidation
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'latestScannedDataTimestamp' || event.key === 'latestScannedDataItem') {
        console.log("[generate page] localStorage change detected, revalidating loader data...");
        // Check if the new value in localStorage is different from what we might already have
        // to avoid unnecessary revalidations if the event is for the same data.
        // This is a simple check; more robust would involve comparing actual data if needed.
        if (event.storageArea?.getItem('latestScannedDataTimestamp') !== localStorage.getItem('lastRevalidatedTimestamp')) {
            revalidator.revalidate();
            localStorage.setItem('lastRevalidatedTimestamp', event.storageArea?.getItem('latestScannedDataTimestamp') || '');
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    console.log("[generate page] Added storage event listener.");

    // Initial revalidate if localStorage already has a newer item than loader (e.g. page was closed and reopened)
    const latestStoredTimestamp = localStorage.getItem('latestScannedDataTimestamp');
    if (latestStoredTimestamp && initialLoaderData.intent !== "loader-fetch-latest" && (!initialLoaderData.timestamp || parseInt(latestStoredTimestamp, 10) > initialLoaderData.timestamp)) {
        console.log("[generate page] Found newer data in localStorage on initial load, revalidating.");
        revalidator.revalidate();
        localStorage.setItem('lastRevalidatedTimestamp', latestStoredTimestamp);
    }


    return () => {
      window.removeEventListener('storage', handleStorageChange);
      console.log("[generate page] Removed storage event listener.");
    };
  }, [revalidator, initialLoaderData.intent, initialLoaderData.timestamp]);


  const handleGenerateNewUuid = () => {
    const formData = new FormData();
    formData.append("intent", "generate-uuid-via-action");
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
              : "掃描資料將更新於此，或點擊按鈕產生新的 UUID QR Code。"
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
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-refresh-cw inline-block mr-2 align-middle"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M3 21a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 16"/><path d="M21 11v5h-5"/></svg>
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
