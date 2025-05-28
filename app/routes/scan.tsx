// app/routes/scan.tsx
import type { MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { Link, json } from "@remix-run/react";
import QrScanner from "~/components/QrScanner";
import { pool } from "~/utils/db.server"; // Import the pool

export const meta: MetaFunction = () => {
  return [
    { title: "掃描 QR Code" },
    { name: "description", content: "使用相機掃描 QR Code" },
  ];
};

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const scannedData = formData.get("scannedData");

  if (typeof scannedData !== "string" || scannedData.trim() === "") {
    return json({ success: false, error: "Scanned data is empty or invalid." }, { status: 400 });
  }

  try {
    const client = await pool.connect();
    try {
      const queryText = 'INSERT INTO scanned_data(data) VALUES($1) RETURNING id';
      const res = await client.query(queryText, [scannedData]);
      return json({ success: true, id: res.rows[0].id, message: "Data saved successfully!" });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Database error:", error);
    return json({ success: false, error: "Failed to save data to database." }, { status: 500 });
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

        <QrScanner /> {/* QrScanner component will handle the submission */}

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