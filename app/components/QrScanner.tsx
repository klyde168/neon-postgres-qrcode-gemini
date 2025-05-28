// app/components/QrScanner.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';
import { useFetcher } from '@remix-run/react'; // Import useFetcher

export default function QrScanner() {
  const [scannedData, setScannedData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fetcher = useFetcher<{success: boolean; message?: string; error?: string; id?: number}>(); // Typed fetcher

  const startScan = async () => {
    setScannedData(null);
    setError(null);
    fetcher.data = undefined; // Clear previous fetcher data
    setIsScanning(true);

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          requestAnimationFrame(tick);
        }
      } catch (err) {
        console.error('相機存取錯誤:', err);
        let errorMessage = '無法存取相機。';
        if (err instanceof Error) {
            if (err.name === 'NotAllowedError') {
                errorMessage = '相機存取被拒絕。請檢查您的瀏覽器權限設定。';
            } else if (err.name === 'NotFoundError') {
                errorMessage = '找不到相機設備。';
            } else if (err.name === 'NotReadableError') {
                errorMessage = '相機目前無法使用，可能被其他應用程式佔用。';
            }
        }
        setError(errorMessage);
        setIsScanning(false);
      }
    } else {
      setError('您的瀏覽器不支援相機存取功能。');
      setIsScanning(false);
    }
  };

  const stopScan = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  }, []);


  const tick = () => {
    if (!isScanning || !streamRef.current) {
        return;
    }

    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert',
            });

            if (code && code.data) {
              setScannedData(code.data);
              stopScan();
              return;
            }
        } catch (e) {
            console.warn("無法獲取影像資料進行掃描:", e);
        }
      }
    }
    if (isScanning && streamRef.current) {
        requestAnimationFrame(tick);
    }
  };

   useEffect(() => {
    if (isScanning && streamRef.current) {
      requestAnimationFrame(tick);
    }
    return () => {
      stopScan();
    };
  }, [isScanning, stopScan]);

  const handleSaveToDatabase = () => {
    if (scannedData) {
      const formData = new FormData();
      formData.append("scannedData", scannedData);
      fetcher.submit(formData, { method: "post", action: "/scan" });
    }
  };

  return (
    <div className="flex flex-col items-center space-y-6 w-full">
      <div className="w-full max-w-sm aspect-[4/3] bg-slate-700 rounded-lg overflow-hidden shadow-lg relative border-2 border-slate-600">
        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${isScanning ? 'block' : 'hidden'}`}
          muted
          playsInline
        />
        {!isScanning && !error && !scannedData && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-camera-off mb-3 opacity-50">
                    {/* SVG path data */}
                </svg>
                <p>點擊「開始掃描」以啟動相機。</p>
            </div>
        )}
        {isScanning && (
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-3/4 h-3/4 border-4 border-dashed border-purple-500 opacity-75 rounded-lg animate-pulse"></div>
            </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {!isScanning && !scannedData ? (
        <button
          onClick={startScan}
          className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold py-3 px-8 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-emerald-500 transition-all duration-150 ease-in-out"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-scan-line inline-block mr-2 align-middle"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/></svg>
          開始掃描
        </button>
      ) : !isScanning && scannedData ? (
        <button
            onClick={startScan} // Or a button to clear and rescan
            className="bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-white font-semibold py-3 px-8 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-amber-500 transition-all duration-150 ease-in-out"
        >
            重新掃描
        </button>
      ) : (
        <button
          onClick={stopScan}
          className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-semibold py-3 px-8 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-rose-500 transition-all duration-150 ease-in-out"
        >
           <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-scan-line-off inline-block mr-2 align-middle"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" x2="17" y1="12" y2="12"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
          停止掃描
        </button>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-700 bg-opacity-50 border border-red-500 text-red-300 rounded-lg text-center w-full max-w-sm">
          <p className="font-semibold">錯誤：</p>
          <p>{error}</p>
        </div>
      )}

      {scannedData && (
        <div className="mt-4 p-6 bg-slate-700 rounded-lg shadow-inner w-full max-w-sm text-center">
          <h3 className="text-xl font-semibold text-slate-200 mb-3">掃描結果：</h3>
          <p className="text-lg text-purple-300 break-all bg-slate-600 p-3 rounded-md">{scannedData}</p>
          <div className="mt-4 space-x-2">
            <button
                onClick={() => {
                    if (navigator.clipboard && scannedData) {
                        navigator.clipboard.writeText(scannedData)
                            .then(() => alert('已複製到剪貼簿！'))
                            .catch(err => console.error('複製失敗:', err));
                    }
                }}
                className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-700 focus:ring-blue-400 transition-all duration-150 ease-in-out"
            >
                複製結果
            </button>
            <fetcher.Form method="post" action="/scan" onSubmit={(e) => { if (!scannedData) e.preventDefault(); }}>
                 <input type="hidden" name="scannedData" value={scannedData || ""} />
                 <button
                    type="submit"
                    disabled={fetcher.state === "submitting" || !scannedData}
                    className="bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-700 focus:ring-teal-400 transition-all duration-150 ease-in-out"
                >
                    {fetcher.state === "submitting" ? "儲存中..." : "儲存到資料庫"}
                </button>
            </fetcher.Form>
          </div>
        </div>
      )}

      {fetcher.data && (
        <div className={`mt-4 p-4 rounded-lg text-center w-full max-w-sm ${fetcher.data.success ? 'bg-green-700 bg-opacity-50 border border-green-500 text-green-300' : 'bg-red-700 bg-opacity-50 border border-red-500 text-red-300'}`}>
            <p>{fetcher.data.message || fetcher.data.error}</p>
        </div>
      )}
    </div>
  );
}