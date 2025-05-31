// app/routes/_index.tsx
import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";

export const meta: MetaFunction = () => {
  return [
    { title: "Remix QR Code 工具" },
    { name: "description", content: "使用 Remix 產生和掃描 QR Code" },
  ];
};

export default function Index() {
  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-700 text-gray-100 p-6 font-sans">
      <div className="bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-2xl">
        {/* GitHub Version Info */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-700 text-slate-300 border border-slate-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
            </svg>
            GitHub: 6d344ff..4bceb85 main → main
          </div>
        </div>

        <header className="mb-10 text-center">
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-orange-400 mb-3">
            QR Code 多功能工具
          </h1>
          <p className="text-slate-400 text-lg">
            輕鬆產生或掃描您的 QR Code。
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-8">
          {/* 卡片：產生 QR Code - 連結到 /generate */}
          <Link
            to="/generate"
            className="group block bg-slate-700 p-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 hover:ring-2 hover:ring-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <div className="flex items-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus-square text-purple-400 mr-3 transition-transform group-hover:scale-110"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
              <h2 className="text-2xl font-semibold text-slate-200">產生 QR Code</h2>
            </div>
            <p className="text-slate-400 mb-5">輸入文字、網址或使用 UUID 快速建立您的專屬 QR Code。</p>
            <div className="mt-auto text-right">
                <span className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-md group-hover:bg-purple-700 transition-colors">
                    前往產生
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-right ml-2 transition-transform group-hover:translate-x-1"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </span>
            </div>
          </Link>

          {/* 卡片：掃描 QR Code - 連結到 /scan */}
          <Link
            to="/scan"
            className="group block bg-slate-700 p-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 hover:ring-2 hover:ring-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <div className="flex items-center mb-4">
               <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-scan-line text-sky-400 mr-3 transition-transform group-hover:scale-110"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/></svg>
              <h2 className="text-2xl font-semibold text-slate-200">掃描 QR Code</h2>
            </div>
            <p className="text-slate-400 mb-5">使用您的相機鏡頭快速讀取 QR Code 中的資訊。</p>
            <div className="mt-auto text-right">
                <span className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-sky-600 rounded-md group-hover:bg-sky-700 transition-colors">
                    前往掃描
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-right ml-2 transition-transform group-hover:translate-x-1"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </span>
            </div>
          </Link>
        </div>

        {/* 新增：資料庫連線測試連結 */}
        <div className="mt-10 text-center">
          <Link
            to="/test-db"
            className="group inline-flex items-center justify-center bg-slate-700 px-6 py-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 hover:ring-2 hover:ring-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-database-zap text-emerald-400 mr-3 transition-transform group-hover:scale-110">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M3 5V19A9 3 0 0 0 21 19V5"/>
              <path d="M3 12A9 3 0 0 0 21 12"/>
              <path d="M13 22V18L10 15L13 12V8"/>
            </svg>
            <span className="text-lg font-semibold text-slate-200">測試資料庫連線</span>
             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-right ml-2 transition-transform group-hover:translate-x-1 text-slate-400"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </Link>
        </div>
      </div>
      <footer className="mt-16 mb-8 text-center text-slate-500 text-sm">
        <p>
          使用{" "}
          <a href="https://remix.run" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
            Remix
          </a>{" "}
          和{" "}
          <a href="https://tailwindcss.com" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">
            Tailwind CSS
          </a>{" "}
          精心製作。
        </p>
      </footer>
    </div>
  );
}
