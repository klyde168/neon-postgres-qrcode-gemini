// app/routes/scan.tsx (Updated with WebSocket support)
import type { MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { Link, json } from "@remix-run/react";
import QrScanner from "~/components/QrScanner";
import { pool } from "~/utils/db.server";
import { broadcastToAll } from "~/utils/websocket.server";

export const meta: MetaFunction = () => {
  return [
    { title: "掃描 QR Code" },
    { name: "description", content: "使用相機掃描 QR Code" },
  ];
};

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const scannedDataValue = formData.get("scannedData");

  if (typeof scannedDataValue !== "string" || scannedDataValue.trim() === "") {
    return json({ success: false, error: "掃描到的資料是空的或無效的。" }, { status: 400 });
  }
  const scannedData = scannedDataValue;

  try {
    const client = await pool.connect();
    try {
      const queryText = 'INSERT INTO scanned_data(data) VALUES($1) RETURNING id, data, scanned_at';
      const res = await client.query(queryText, [scannedData]);
      
      const result = {
        success: true,
        id: res.rows[0].id,
        savedData: res.rows[0].data,
        message: "資料已成功儲存到資料庫！"
      };

      // Broadcast to all WebSocket clients
      broadcastToAll({
        type: 'qr_scanned',
        data: {
          id: result.id,
          content: result.savedData,
          scannedAt: res.rows[0].scanned_at
        }
      });

      return json(result);
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
            將 QR Code 對準相機鏡頭以進行掃描。掃描結果會即時同步到產生頁面。
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