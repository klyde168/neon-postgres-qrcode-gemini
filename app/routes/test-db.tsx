// app/routes/test-db.tsx
import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json, Link, useLoaderData } from "@remix-run/react";
import { pool } from "~/../db.server"; // 確保路徑正確

export const meta: MetaFunction = () => {
  return [
    { title: "資料庫連線測試" },
    { name: "description", content: "測試與 Neon.tech PostgreSQL 資料庫的連線狀態" },
  ];
};

interface LoaderData {
  status: "success" | "error";
  message: string;
  dbTime?: string;
  errorDetail?: string;
}

export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  console.log('[DB TEST LOADER] Attempting to connect to the database...');
  try {
    if (!pool) {
      console.error('[DB TEST LOADER] Database pool is not initialized');
      return json({
        status: "error",
        message: "資料庫連接池未初始化。",
        errorDetail: "The database pool (pool) is undefined. Check db.server.ts.",
      } as LoaderData, { status: 500 });
    }

    const client = await pool.connect();
    console.log('[DB TEST LOADER] Successfully connected to the database client.');
    try {
      const result = await client.query("SELECT NOW() as current_time");
      const dbTime = result.rows[0]?.current_time;
      console.log('[DB TEST LOADER] Query successful. DB time:', dbTime);
      return json({
        status: "success",
        message: "成功連接到資料庫！",
        dbTime: dbTime ? new Date(dbTime).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : "無法取得時間",
      } as LoaderData);
    } catch (queryError: any) {
      console.error('[DB TEST LOADER] Database query error:', queryError.message);
      return json({
        status: "error",
        message: "資料庫查詢失敗。",
        errorDetail: queryError.message,
      } as LoaderData, { status: 500 });
    } finally {
      client.release();
      console.log('[DB TEST LOADER] Database client released.');
    }
  } catch (connectionError: any) {
    console.error('[DB TEST LOADER] Database connection error:', connectionError.message);
    let errorDetail = connectionError.message;
    if (connectionError.code) {
      errorDetail += ` (Code: ${connectionError.code})`;
    }
    // 檢查是否為 Neon.tech 特有的連線問題提示
    if (connectionError.message.includes('SNI')) {
        errorDetail += ' 請確認您的 Neon.tech 資料庫連線字串是否包含 `sslmode=require` 或正確的 SSL 設定。';
    }
    if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL?.includes('sslmode')) {
        errorDetail += ' 偵測到生產環境，但 DATABASE_URL 可能未包含 SSL 設定。Neon.tech 通常需要 SSL 連線。';
    }

    return json({
      status: "error",
      message: "無法連接到資料庫。",
      errorDetail: errorDetail,
    } as LoaderData, { status: 500 });
  }
}

export default function TestDbPage() {
  const data = useLoaderData<LoaderData>();

  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700 text-gray-100 p-6 font-sans">
      <div className="bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-md">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400 mb-2">
            資料庫連線測試
          </h1>
          <p className="text-slate-400">
            此頁面用於測試與 Neon.tech PostgreSQL 資料庫的連線。
          </p>
        </header>

        <div className="space-y-4">
          {data.status === "success" ? (
            <div className="p-6 bg-green-700 bg-opacity-30 border border-green-500 rounded-lg text-center">
              <h2 className="text-2xl font-semibold text-green-300 mb-2">連線成功！</h2>
              <p className="text-green-200">{data.message}</p>
              {data.dbTime && (
                <p className="text-green-200 mt-2">
                  資料庫目前時間： <span className="font-semibold text-green-100">{data.dbTime}</span>
                </p>
              )}
            </div>
          ) : (
            <div className="p-6 bg-red-700 bg-opacity-30 border border-red-500 rounded-lg text-center">
              <h2 className="text-2xl font-semibold text-red-300 mb-2">連線失敗</h2>
              <p className="text-red-200">{data.message}</p>
              {data.errorDetail && (
                <div className="mt-3 pt-3 border-t border-red-600 text-left">
                  <p className="text-sm text-red-300 font-semibold">錯誤詳細資訊：</p>
                  <pre className="mt-1 p-2 bg-slate-900 rounded-md text-xs text-red-200 overflow-x-auto">
                    {data.errorDetail}
                  </pre>
                </div>
              )}
               <div className="mt-4 text-xs text-slate-400 text-left">
                <p className="font-semibold">提示：</p>
                <ul className="list-disc list-inside pl-2">
                  <li>請檢查您的 <code>.env</code> 檔案中的 <code>DATABASE_URL</code> 是否正確設定。</li>
                  <li>對於 Neon.tech，連線字串通常需要包含 <code>sslmode=require</code>。</li>
                  <li>確認您的 Neon IP Allowlist 設定是否允許來自應用程式部署環境的連線。</li>
                  <li>檢查 <code>db.server.ts</code> 中的 SSL 設定，特別是在生產環境中 (<code>ssl: process.env.NODE_ENV === 'production' ? {`{ rejectUnauthorized: false }`} : false</code>)。</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/"
            className="inline-block text-purple-400 hover:text-purple-300 hover:underline transition-colors"
          >
            ← 返回主頁
          </Link>
        </div>
      </div>
       <footer className="mt-12 text-center text-slate-500 text-sm">
        <p>
          QR Code 多功能工具
        </p>
      </footer>
    </div>
  );
}
