// app/routes/scan.tsx
import type { MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { Link, json } from "@remix-run/react";
import QrScanner from "~/components/QrScanner";
import { pool } from "~/utils/db.server";

export const meta: MetaFunction = () => {
  return [
    { title: "掃描 QR Code" },
    { name: "description", content: "使用相機掃描 QR Code" },
  ];
};

// 解析 QR Code 內容中的時間戳記
function extractTimestampFromQRCode(qrContent: string): number | null {
  try {
    // 嘗試多種時間格式的解析
    
    // 格式1: 純數字時間戳記 (13位毫秒或10位秒)
    const numberMatch = qrContent.match(/\b(\d{10,13})\b/);
    if (numberMatch) {
      const timestamp = parseInt(numberMatch[1], 10);
      // 如果是10位數字，轉換為毫秒
      const finalTimestamp = timestamp.toString().length === 10 ? timestamp * 1000 : timestamp;
      // 驗證是否為合理的時間戳記 (2000年後到2100年前)
      if (finalTimestamp > 946684800000 && finalTimestamp < 4102444800000) {
        return finalTimestamp;
      }
    }
    
    // 格式2: ISO 8601 格式 (YYYY-MM-DDTHH:mm:ss)
    const isoMatch = qrContent.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})?)/);
    if (isoMatch) {
      const date = new Date(isoMatch[1]);
      if (!isNaN(date.getTime())) {
        return date.getTime();
      }
    }
    
    // 格式3: 其他常見日期格式
    const dateFormats = [
      /(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/,  // YYYY/MM/DD HH:mm:ss
      /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/,  // MM/DD/YYYY HH:mm:ss
      /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/     // YYYY-MM-DD HH:mm:ss
    ];
    
    for (const format of dateFormats) {
      const match = qrContent.match(format);
      if (match) {
        const date = new Date(match[1]);
        if (!isNaN(date.getTime())) {
          return date.getTime();
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error("Error parsing timestamp from QR code:", error);
    return null;
  }
}

// 格式化時間顯示
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const scannedDataValue = formData.get("scannedData");
  const scanTimestampValue = formData.get("scanTimestamp");

  if (typeof scannedDataValue !== "string" || scannedDataValue.trim() === "") {
    return json({ success: false, error: "掃描到的資料是空的或無效的。" }, { status: 400 });
  }

  if (typeof scanTimestampValue !== "string" || !scanTimestampValue) {
    return json({ success: false, error: "掃描時間戳記無效。" }, { status: 400 });
  }

  const scannedData = scannedDataValue;
  const scanTimestamp = parseInt(scanTimestampValue, 10);
  const currentTimestamp = Date.now();
  const timeDifference = Math.floor((currentTimestamp - scanTimestamp) / 1000); // 時間差（秒）

  // 解析 QR Code 內容中的時間戳記
  const qrTimestamp = extractTimestampFromQRCode(scannedData);
  
  // 計算掃描時間與 QR Code 內容時間的差距
  let qrTimeDifference: number | null = null;
  if (qrTimestamp) {
    qrTimeDifference = Math.floor((scanTimestamp - qrTimestamp) / 1000);
  }

  // 檢查掃描後的時間差是否在5秒內
  if (timeDifference > 5) {
    return json({ 
      success: false, 
      error: `掃描資料已過期（${timeDifference} 秒前），請重新掃描。`,
      timeDifference,
      scanTime: formatTimestamp(scanTimestamp),
      currentTime: formatTimestamp(currentTimestamp),
      qrTimestamp: qrTimestamp ? formatTimestamp(qrTimestamp) : null,
      qrTimeDifference
    }, { status: 400 });
  }

  try {
    const client = await pool.connect();
    try {
      const queryText = 'INSERT INTO scanned_data(data) VALUES($1) RETURNING id, data, scanned_at';
      const res = await client.query(queryText, [scannedData]);
      
      const savedTimestamp = new Date(res.rows[0].scanned_at).getTime();
      
      return json({
        success: true,
        id: res.rows[0].id,
        savedData: res.rows[0].data,
        message: `資料已成功儲存到資料庫！（掃描後 ${timeDifference} 秒）`,
        timeDifference,
        scanTime: formatTimestamp(scanTimestamp),
        currentTime: formatTimestamp(currentTimestamp),
        savedTime: formatTimestamp(savedTimestamp),
        qrTimestamp: qrTimestamp ? formatTimestamp(qrTimestamp) : null,
        qrTimeDifference
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Database error in /scan action:", error);
    return json({ success: false, error: "儲存資料到資料庫時失敗。" }, { status: 500 });
  }
}

export default function ScanPage() {
  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700 text-gray-100 p-6 font-sans">
      <div className="bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-lg">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-400 mb-2">
            QR Code 掃描器
          </h1>
          <p className="text-slate-400">
            將 QR Code 對準相機鏡頭以進行掃描。掃描後5秒內會自動儲存到資料庫。
          </p>
        </header>

        <QrScanner />

        <div className="mt-8 text-center">
          <Link
            to="/"
            className="inline-block text-purple-400 hover:text-purple-300 hover:underline transition-colors"
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