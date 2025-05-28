// app/components/QrScanner.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import jsQR, { QRCode } from 'jsqr'; // Import QRCode type for better typing
import { useFetcher } from '@remix-run/react';

export default function QrScanner() {
  const [scannedData, setScannedData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [cameraPermissionError, setCameraPermissionError] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fetcher = useFetcher<{success: boolean; message?: string; error?: string; id?: number}>();

  const startScan = async () => {
    console.log("Attempting to start scan...");
    setScannedData(null);
    setError(null);
    setCameraPermissionError(false);
    fetcher.data = undefined;
    setIsScanning(true);

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        console.log("Camera stream obtained.");
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
            console.log("Video playback started.");
            requestAnimationFrame(tick);
          } catch (playError) {
            console.error('影片播放錯誤 (Video play error):', playError);
            setError('無法播放相機畫面。請檢查相機是否被其他應用程式使用。 (Cannot play camera feed. Check if camera is used by another app.)');
            setCameraPermissionError(true);
            setIsScanning(false);
            stopScan();
          }
        }
      } catch (err) {
        console.error('相機存取錯誤 (Camera access error):', err);
        let errorMessage = '無法存取相機。 (Cannot access camera.)';
        if (err instanceof Error) {
            if (err.name === 'NotAllowedError') {
                errorMessage = '相機存取被拒絕。請檢查您的瀏覽器權限設定。 (Camera access denied. Please check your browser permission settings.)';
            } else if (err.name === 'NotFoundError') {
                errorMessage = '找不到相機設備。 (Camera device not found.)';
            } else if (err.name === 'NotReadableError') {
                errorMessage = '相機目前無法使用，可能被其他應用程式佔用。 (Camera is currently unreadable, possibly used by another application.)';
            } else if (err.name === 'AbortError') {
                errorMessage = '相機請求被中止。 (Camera request was aborted.)';
            } else if (err.name === 'OverconstrainedError') {
                errorMessage = '找不到符合要求的相機設備 (例如指定的 facingMode)。 (Could not find a camera matching the specified constraints (e.g., facingMode).)';
            } else if (err.name === 'SecurityError') {
                errorMessage = '相機存取因安全性問題被拒絕 (例如在不安全的 http 環境下)。 (Camera access denied due to security reasons (e.g., insecure HTTP environment).)';
            }
        }
        setError(errorMessage);
        setCameraPermissionError(true);
        setIsScanning(false);
      }
    } else {
      console.error("navigator.mediaDevices.getUserMedia not supported.");
      setError('您的瀏覽器不支援相機存取功能。 (Your browser does not support camera access.)');
      setCameraPermissionError(true);
      setIsScanning(false);
    }
  };

  const stopScan = useCallback(() => {
    console.log("Stopping scan...");
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      console.log("Camera stream stopped.");
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  }, []);


  const tick = () => {
    if (!isScanning || !streamRef.current || !videoRef.current || !canvasRef.current) {
      // console.log("Tick: Aborting, conditions not met.", { isScanning, streamRefExists: !!streamRef.current, videoRefExists: !!videoRef.current, canvasRefExists: !!canvasRef.current });
      return;
    }

    // console.log("Tick: Processing frame.");
    if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (ctx) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;

        if (canvas.width === 0 || canvas.height === 0) {
            // console.log("Tick: Canvas dimensions are zero, retrying next frame.");
            if (isScanning && streamRef.current) requestAnimationFrame(tick);
            return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            if (imageData.data.some(channel => channel !== 0)) {
                const code: QRCode | null = jsQR(imageData.data, imageData.width, imageData.height, {
                  inversionAttempts: 'dontInvert',
                });

                // console.log("jsQR raw result:", code); // Log the entire result from jsQR

                if (code) { // Check if jsQR returned an object (found something)
                  console.log("QR Code object found by jsQR. Data content:", code.data, "| Type of data:", typeof code.data);
                  if (code.data && code.data.trim() !== "") { // Check if data is truthy AND not just whitespace
                    console.log("Setting scanned data state with:", code.data);
                    setScannedData(code.data);
                    stopScan();
                    return;
                  } else {
                    console.log("QR Code found by jsQR, but data is empty, whitespace, or falsy. Not setting state.");
                  }
                } else {
                  // console.log("jsQR did not find a QR code in this frame.");
                }
            } else {
              // console.log("Tick: Image data is all black, skipping jsQR.");
            }
        } catch (e) {
            console.warn("無法獲取影像資料或解碼錯誤 (Could not get image data or decoding error):", e);
        }
      }
    }
    if (isScanning && streamRef.current) {
        requestAnimationFrame(tick);
    }
  };

   useEffect(() => {
    return () => {
      stopScan();
    };
  }, [stopScan]);


  return (
    <div className="flex flex-col items-center space-y-6 w-full">
      <div className="w-full max-w-sm aspect-[4/3] bg-slate-700 rounded-lg overflow-hidden shadow-lg relative border-2 border-slate-600">
        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${isScanning ? 'block' : 'hidden'}`}
          muted
          autoPlay
          playsInline
        />
        {(!isScanning && !scannedData) && (
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
                {cameraPermissionError ? (
                    <p className="text-red-400">{error || '無法啟動相機。請檢查權限並重試。 (Cannot start camera. Please check permissions and try again.)'}</p>
                ) : (
                    <p>點擊「開始掃描」以啟動相機。 (Click "Start Scan" to activate camera.)</p>
                )}
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
          開始掃描 (Start Scan)
        </button>
      ) : !isScanning && scannedData ? (
        <button
            onClick={startScan}
            className="bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-white font-semibold py-3 px-8 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-amber-500 transition-all duration-150 ease-in-out"
        >
            重新掃描 (Rescan)
        </button>
      ) : (
        <button
          onClick={stopScan}
          className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-semibold py-3 px-8 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-rose-500 transition-all duration-150 ease-in-out"
        >
           <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-scan-line-off inline-block mr-2 align-middle"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" x2="17" y1="12" y2="12"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
          停止掃描 (Stop Scan)
        </button>
      )}

      {error && !cameraPermissionError && (
        <div className="mt-4 p-4 bg-red-700 bg-opacity-50 border border-red-500 text-red-300 rounded-lg text-center w-full max-w-sm">
          <p className="font-semibold">錯誤 (Error)：</p>
          <p>{error}</p>
        </div>
      )}

      {scannedData && (
        <div className="mt-4 p-6 bg-slate-700 rounded-lg shadow-inner w-full max-w-sm text-center">
          <h3 className="text-xl font-semibold text-slate-200 mb-3">掃描結果 (Scanned Result)：</h3>
          <p className="text-lg text-purple-300 break-all bg-slate-600 p-3 rounded-md">{scannedData}</p>
          <div className="mt-4 flex flex-col sm:flex-row justify-center items-center space-y-2 sm:space-y-0 sm:space-x-2">
            <button
                onClick={() => {
                    if (navigator.clipboard && scannedData) {
                        navigator.clipboard.writeText(scannedData)
                            .then(() => alert('已複製到剪貼簿！ (Copied to clipboard!)'))
                            .catch(err => {
                                console.error('複製失敗 (Copy failed):', err);
                                alert('複製失敗，請手動複製。 (Copy failed, please copy manually.)');
                            });
                    }
                }}
                className="w-full sm:w-auto bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-700 focus:ring-blue-400 transition-all duration-150 ease-in-out"
            >
                複製結果 (Copy Result)
            </button>
            <fetcher.Form method="post" action="/scan" className="w-full sm:w-auto" onSubmit={(e) => { if (!scannedData) e.preventDefault(); }}>
                 <input type="hidden" name="scannedData" value={scannedData || ""} />
                 <button
                    type="submit"
                    disabled={fetcher.state === "submitting" || !scannedData}
                    className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-700 focus:ring-teal-400 transition-all duration-150 ease-in-out"
                >
                    {fetcher.state === "submitting" ? "儲存中... (Saving...)" : "儲存到資料庫 (Save to Database)"}
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
