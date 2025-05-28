// app/routes/generate.tsx
import type { MetaFunction, ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, json, useSubmit, useLoaderData } from "@remix-run/react";
import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { randomUUID } from "node:crypto";

export const meta: MetaFunction = () => {
  return [
    { title: "產生 QR Code" },
    { name: "description", content: "快速產生一個 QR Code，初始為 UUID" },
  ];
};

// Define a type for the data returned by loader and action
type QrCodeResponse = {
  qrCodeDataUrl?: string | null;
  error?: string | null;
  sourceText?: string | null; // Text that was encoded
  intent?: string | null; // To differentiate loader from action, or specific actions
};

// Loader function: Executes on initial page load on the server
export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  const url = new URL(request.url);
  // Allow overriding default size/EC via query params for loader if needed in future
  // For now, using defaults for initial UUID
  const initialSize = url.searchParams.get("size") || "256";
  const initialEcLevel = (url.searchParams.get("ecLevel") as QRCode.QRCodeErrorCorrectionLevel) || "H";

  const initialUuid = randomUUID();
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(initialUuid, {
      errorCorrectionLevel: initialEcLevel,
      width: parseInt(initialSize, 10),
      margin: 2,
      color: {
        dark: "#0F172A",
        light: "#FFFFFF"
      }
    });
    return json({ qrCodeDataUrl, error: null, sourceText: initialUuid, intent: "loader-initial-uuid" } as QrCodeResponse);
  } catch (err) {
    console.error("Initial QR Code generation error (loader):", err);
    return json({ error: "初始 QR Code 產生失敗。", qrCodeDataUrl: null, sourceText: initialUuid, intent: "loader-initial-uuid" } as QrCodeResponse, { status: 500 });
  }
}

// Action function: Executes on form submission (e.g., button click) on the server
export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  const formData = await request.formData();
  const intent = formData.get("intent") as string | null;
  let textToEncode: string | null = null;
  let sourceTextForResponse: string | null = null;

  if (intent === "generate-uuid") {
    textToEncode = randomUUID();
    sourceTextForResponse = textToEncode;
  } else {
    const textValue = formData.get("text"); // For potential future manual text input
    if (typeof textValue === 'string' && textValue.trim() !== "") {
      textToEncode = textValue;
      sourceTextForResponse = textToEncode;
    } else if (intent !== "generate-uuid") {
        return json({ error: "請輸入有效的文字或點擊產生 UUID。", qrCodeDataUrl: null, sourceText: typeof textValue === 'string' ? textValue : "", intent } as QrCodeResponse, { status: 400 });
    }
  }

  if (!textToEncode) {
    return json({ error: "無法確定要編碼的內容。", qrCodeDataUrl: null, sourceText: null, intent } as QrCodeResponse, { status: 400 });
  }

  if (textToEncode.length > 1000) {
    return json({ error: "內容過長，請縮短後再試。", qrCodeDataUrl: null, sourceText: textToEncode, intent } as QrCodeResponse, { status: 400 });
  }

  const sizeValue = formData.get("size") || "256";
  const errorCorrectionLevelValue = formData.get("errorCorrectionLevel") || "H";

  try {
    const qrCodeDataUrl = await QRCode.toDataURL(textToEncode, {
      errorCorrectionLevel: errorCorrectionLevelValue as QRCode.QRCodeErrorCorrectionLevel,
      width: parseInt(sizeValue as string, 10),
      margin: 2,
      color: {
        dark: "#0F172A",
        light: "#FFFFFF"
      }
    });
    return json({ qrCodeDataUrl, error: null, sourceText: textToEncode, intent } as QrCodeResponse);
  } catch (err) {
    console.error("QR Code generation error (action):", err);
    return json({ error: "產生 QR Code 時發生錯誤。", qrCodeDataUrl: null, sourceText: textToEncode, intent } as QrCodeResponse, { status: 500 });
  }
}

export default function GeneratePage() {
  const loaderData = useLoaderData<QrCodeResponse>();
  const actionData = useActionData<QrCodeResponse>();

  // Determine which data to use: actionData takes precedence if available
  const currentQrData = actionData || loaderData;

  const [qrSize, setQrSize] = useState("256");
  const [errorCorrection, setErrorCorrection] = useState<QRCode.QRCodeErrorCorrectionLevel>("H");
  const imgRef = useRef<HTMLImageElement>(null);
  const submit = useSubmit();

  const [displayedQrUrl, setDisplayedQrUrl] = useState<string | null>(null);
  const [displayedSourceText, setDisplayedSourceText] = useState<string | null>(null);

  useEffect(() => {
    if (currentQrData?.qrCodeDataUrl) {
      setDisplayedQrUrl(currentQrData.qrCodeDataUrl);
    } else if (currentQrData?.error) {
      setDisplayedQrUrl(null); // Clear QR on error
    }
    if (currentQrData?.sourceText) {
      setDisplayedSourceText(currentQrData.sourceText);
    } else if (currentQrData?.error) {
      setDisplayedSourceText(currentQrData.sourceText || null); // Show attempted text on error if available
    }
  }, [currentQrData]);


  const handleGenerateUuid = () => {
    const formData = new FormData();
    formData.append("intent", "generate-uuid");
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
            初始載入時會自動產生一個 UUID QR Code。點擊按鈕可產生新的。
          </p>
        </header>

        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="qr-size" className="block text-sm font-medium text-slate-300 mb-1">
                    尺寸 (像素):
                    </label>
                    <select
                    id="qr-size"
                    name="size"
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
                    <label htmlFor="error-correction" className="block text-sm font-medium text-slate-300 mb-1">
                    容錯等級:
                    </label>
                    <select
                    id="error-correction"
                    name="errorCorrectionLevel"
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
                onClick={handleGenerateUuid}
                className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-semibold py-3 px-6 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-cyan-500 transition-all duration-150 ease-in-out active:transform active:scale-95"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-refresh-cw inline-block mr-2 align-middle"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M3 21a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 16"/><path d="M21 11v5h-5"/></svg>
                產生新的 UUID QR Code
            </button>
        </div>


        {currentQrData?.error && (
          <div id="text-input-error" className="mt-6 p-3 bg-red-800 bg-opacity-70 border border-red-600 text-red-200 rounded-lg text-center" role="alert">
            <p className="font-medium">錯誤：</p>
            <p>{currentQrData.error}</p>
          </div>
        )}

        {displayedQrUrl && (
          <div className="mt-8 text-center p-6 bg-slate-700 rounded-lg shadow-inner">
            <h3 className="text-xl font-semibold text-slate-100 mb-2">目前 QR Code：</h3>
            {displayedSourceText && (
                <p className="text-xs text-slate-400 mb-3 break-all">內容: {displayedSourceText}</p>
            )}
            <div className="flex justify-center items-center bg-white p-2 rounded-md inline-block shadow-lg">
                <img
                ref={imgRef}
                src={displayedQrUrl}
                alt="產生的 QR Code"
                className="mx-auto"
                />
            </div>
            <a
              href={displayedQrUrl}
              download={`qrcode_${(displayedSourceText?.substring(0,15).replace(/[^a-zA-Z0-9]/g, '_')) || 'generated'}.png`}
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
