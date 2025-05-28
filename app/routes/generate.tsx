// app/routes/generate.tsx
import type { MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, json } from "@remix-run/react";
import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode"; // 確保您已經安裝了 qrcode 套件

export const meta: MetaFunction = () => {
  return [
    { title: "產生 QR Code" },
    { name: "description", content: "輸入文字或網址以產生 QR Code" },
  ];
};

// Remix Action 函數，在伺服器端執行
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const textValue = formData.get("text"); // formData.get() returns FormDataEntryValue | null
  const sizeValue = formData.get("size") || "256";
  const errorCorrectionLevelValue = formData.get("errorCorrectionLevel") || "H";

  const text = typeof textValue === 'string' ? textValue : ""; // Ensure text is a string

  if (text.trim() === "") {
    return json({ error: "請輸入有效的文字以產生 QR Code。", qrCodeDataUrl: null, submittedText: text }, { status: 400 });
  }

  if (text.length > 1000) { // 限制輸入長度，避免產生過於複雜的 QR Code
    return json({ error: "輸入文字過長，請縮短後再試。", qrCodeDataUrl: null, submittedText: text }, { status: 400 });
  }

  try {
    const qrCodeDataUrl = await QRCode.toDataURL(text, {
      errorCorrectionLevel: errorCorrectionLevelValue as QRCode.QRCodeErrorCorrectionLevel,
      width: parseInt(sizeValue as string, 10),
      margin: 2, // 邊距
      color: {
        dark: "#0F172A",  // 深色 (slate-900)
        light: "#FFFFFF"  // 淺色 (white)
      }
    });
    return json({ qrCodeDataUrl, error: null, submittedText: text });
  } catch (err) {
    console.error("QR Code generation error:", err);
    return json({ error: "產生 QR Code 時發生錯誤，請稍後再試。", qrCodeDataUrl: null, submittedText: text }, { status: 500 });
  }
}

export default function GeneratePage() {
  const actionData = useActionData<typeof action>();
  // 確保 submittedText 是字串類型
  const initialInputText = typeof actionData?.submittedText === 'string' ? actionData.submittedText : "";
  const [inputText, setInputText] = useState(initialInputText);
  const [qrSize, setQrSize] = useState("256");
  const [errorCorrection, setErrorCorrection] = useState<QRCode.QRCodeErrorCorrectionLevel>("H");
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // 確保 actionData.submittedText 是字串才更新 inputText
    if (actionData?.submittedText && typeof actionData.submittedText === 'string') {
      setInputText(actionData.submittedText);
    } else if (actionData && !actionData.submittedText) {
      // 如果 actionData 存在但 submittedText 為空 (例如，初始載入或錯誤後)，則清空輸入框
      setInputText("");
    }
  }, [actionData]);


  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700 text-gray-100 p-6 font-sans">
      <div className="bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-lg">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 mb-2">
            QR Code 產生器
          </h1>
          <p className="text-slate-400">
            輸入文字或網址，點擊按鈕即可產生。
          </p>
        </header>

        <Form method="post" className="space-y-6">
          <div>
            <label htmlFor="text-input" className="block text-sm font-medium text-slate-300 mb-1">
              要編碼的內容：
            </label>
            <textarea
              id="text-input"
              name="text"
              rows={4}
              className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-slate-200 focus:ring-purple-500 focus:border-purple-500 placeholder-slate-500 shadow-sm"
              placeholder="例如：https://remix.run 或任何文字"
              value={inputText} // inputText 現在確保是 string
              onChange={(e) => setInputText(e.target.value)}
              required
              aria-describedby="text-input-error"
            />
          </div>

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
            type="submit"
            className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold py-3 px-6 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-pink-500 transition-all duration-150 ease-in-out active:transform active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-qr-code inline-block mr-2 align-middle"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h.01"/><path d="M21 12h.01"/><path d="M12 21v-3a2 2 0 0 0-2-2H7"/><path d="M3 7h3a2 2 0 0 0 2-2V3"/></svg>
            產生 QR Code
          </button>
        </Form>

        {actionData?.error && (
          <div id="text-input-error" className="mt-6 p-3 bg-red-800 bg-opacity-70 border border-red-600 text-red-200 rounded-lg text-center" role="alert">
            <p className="font-medium">錯誤：</p>
            <p>{actionData.error}</p>
          </div>
        )}

        {actionData?.qrCodeDataUrl && (
          <div className="mt-8 text-center p-6 bg-slate-700 rounded-lg shadow-inner">
            <h3 className="text-xl font-semibold text-slate-100 mb-4">產生的 QR Code：</h3>
            <div className="flex justify-center items-center bg-white p-2 rounded-md inline-block shadow-lg">
                <img
                ref={imgRef}
                src={actionData.qrCodeDataUrl}
                alt="產生的 QR Code"
                className="mx-auto" // 尺寸由 toDataURL 的 width 控制
                />
            </div>
            <a
              href={actionData.qrCodeDataUrl}
              download={`qrcode-${(inputText.substring(0,20).replace(/\s+/g, '_')) || 'generated'}.png`}
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
