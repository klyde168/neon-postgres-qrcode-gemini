// app/routes/scan.tsx
import type { MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { Link, json } from "@remix-run/react";
import QrScanner from "~/components/QrScanner";
import { pool } from "db.server";

export const meta: MetaFunction = () => {
  return [
    { title: "掃描 QR Code" },
    { name: "description", content: "使用相機掃描 QR Code" },
  ];
};

export async function action({ request }: ActionFunctionArgs) {
  console.log('[SCAN ACTION] Started processing scan action');
  
  try {
    const formData = await request.formData();
    const scannedDataValue = formData.get("scannedData");

    if (typeof scannedDataValue !== "string" || scannedDataValue.trim() === "") {
      console.log('[SCAN ACTION] Invalid or empty scanned data');
      return json({ success: false, error: "掃描到的資料是空的或無效的。" }, { status: 400 });
    }
    
    const scannedData = scannedDataValue.trim();
    console.log('[SCAN ACTION] Processing scanned data:', scannedData.substring(0, 50) + '...');

    // 檢查資料庫連接池
    if (!pool) {
      console.error('[SCAN ACTION] Database pool is not initialized');
      return json({ success: false, error: "資料庫連接未初始化。" }, { status: 500 });
    }

    const client = await pool.connect();
    console.log('[SCAN ACTION] Database client connected');
    
    try {
      // 測試資料庫連接
      await client.query('SELECT 1');
      console.log('[SCAN ACTION] Database connection test passed');

      const queryText = 'INSERT INTO scanned_data(data) VALUES($1) RETURNING id, data, scanned_at';
      const res = await client.query(queryText, [scannedData]);
      
      console.log('[SCAN ACTION] Data inserted successfully with ID:', res.rows[0].id);
      
      return json({
        success: true,
        id: res.rows[0].id,
        savedData: res.rows[0].data,
        message: "資料已成功儲存到資料庫！"
      });
    } catch (queryError: any) {
      console.error('[SCAN ACTION] Database query error:', queryError.message);
      console.error('[SCAN ACTION] Query error stack:', queryError.stack);
      return json({ 
        success: false, 
        error: `資料庫查詢錯誤: ${queryError.message}` 
      }, { status: 500 });
    } finally {
      client.release();
      console.log('[SCAN ACTION] Database client released');
    }
  } catch (error: any) {
    console.error('[SCAN ACTION] General error:', error.message);
    console.error('[SCAN ACTION] Error stack:', error.stack);
    return json({ 
      success: false, 
      error: `處理掃描資料時發生錯誤: ${error.message}` 
    }, { status: 500 });
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
            將 QR Code 對準相機鏡頭以進行掃描。
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