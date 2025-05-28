import { useState, useRef, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';

export default function QrScanner() {
  const [scannedData, setScannedData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null); // 用於儲存 MediaStream 以便停止

  const startScan = async () => {
    setScannedData(null);
    setError(null);
    setIsScanning(true);

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }, // 優先使用後置鏡頭
        });
        streamRef.current = stream; // 儲存 stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true'); // 為了 iOS Safari
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
    if (!isScanning || !streamRef.current) { // 如果已停止掃描或沒有 stream，則返回
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

            if (code && code.data) { // 確保 code.data 存在
              setScannedData(code.data);
              stopScan(); // 掃描到結果後停止
              return; // 停止 tick 循環
            }
        } catch (e) {
            // getImageData 可能會因為 canvas 太小或 video 尚未完全載入而拋出錯誤
            console.warn("無法獲取影像資料進行掃描:", e);
        }
      }
    }
    // 只有在 isScanning 為 true 且 stream 存在時才繼續
    if (isScanning && streamRef.current) {
        requestAnimationFrame(tick);
    }
  };

  // 在 isScanning 狀態改變時啟動或停止 tick
   useEffect(() => {
    if (isScanning && streamRef.current) { // 只有在 isScanning 為 true 且 stream 已成功獲取時才開始 tick
      requestAnimationFrame(tick);
    }
    // 元件卸載時確保停止掃描
    return () => {
      stopScan();
    };
  }, [isScanning, stopScan]); // stopScan 加入依賴項


  return (
    <div className="flex flex-col items-center space-y-6 w-full">
      <div className="w-full max-w-sm aspect-[4/3] bg-slate-700 rounded-lg overflow-hidden shadow-lg relative border-2 border-slate-600">
        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${isScanning ? 'block' : 'hidden'}`}
          muted // 靜音以避免回授
          playsInline // 為了 iOS Safari
        />
        {!isScanning && !error && !scannedData && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-camera-off mb-3 opacity-50">
                    <line x1="2" x2="22" y1="2" y2="22"/>
                    <path d="M10.36 10.36a5 5 0 0 0-5.72-5.72"/>
                    <path d="M14.43 14.43a5 5 0 0 0 5.72 5.72"/>
                    <path d="M14.43 2.28a5.01 5.01 0 0 1 3.34 1.07l2.28 2.28"/>
                    <path d="M2.28 14.43a5.01 5.01 0 0 1-1.07-3.34l-.01-2.28"/>
                    <path d="m2 2 20 20"/>
                    <path d="M17.5 17.5 14 14"/>
                </svg>
                <p>點擊「開始掃描」以啟動相機。</p>
            </div>
        )}
        {isScanning && (
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-3/4 h-3/4 border-4 border-dashed border-purple-500 opacity-75 rounded-lg animate-pulse"></div>
            </div>
        )}
        {/* Hidden canvas for jsQR */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {!isScanning ? (
        <button
          onClick={startScan}
          className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold py-3 px-8 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-emerald-500 transition-all duration-150 ease-in-out"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-scan-line inline-block mr-2 align-middle"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/></svg>
          開始掃描
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
          <button
            onClick={() => {
                if (navigator.clipboard && scannedData) {
                    navigator.clipboard.writeText(scannedData)
                        .then(() => alert('已複製到剪貼簿！')) // 這裡可以使用更美觀的提示框
                        .catch(err => console.error('複製失敗:', err));
                }
            }}
            className="mt-4 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-700 focus:ring-blue-400 transition-all duration-150 ease-in-out"
          >
            複製結果
          </button>
        </div>
      )}
    </div>
  );
}
