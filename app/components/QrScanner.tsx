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
  const [debugMessages, setDebugMessages] = useState<string[]>([]); // State for UI logs

  // Helper to add debug messages to UI and console
  const addDebugMessage = useCallback((message: string) => {
    // Keep console logging for more detailed inspection if needed
    console.log(`[QR DEBUG] ${new Date().toLocaleTimeString()}: ${message}`);
    // Update UI-visible logs, keeping only the last few to prevent clutter
    setDebugMessages(prev => [...prev.slice(-7), `${new Date().toLocaleTimeString()}: ${message}`]);
  }, []);


  const startScan = async () => {
    addDebugMessage("嘗試開始掃描 (Attempting to start scan)...");
    setScannedData(null); // Clear previous scanned data
    setError(null); // Clear previous errors
    setCameraPermissionError(false); // Reset camera error state
    fetcher.data = undefined; // Clear previous fetcher data
    setDebugMessages([]); // Clear previous debug messages on new scan attempt
    setIsScanning(true); // Set isScanning to true to show the video element

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }, // Prefer rear camera
        });
        addDebugMessage("相機串流已獲取 (Camera stream obtained).");
        streamRef.current = stream; // Store stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
            addDebugMessage("影片播放已開始 (Video playback started).");
            requestAnimationFrame(tick); // Start the scanning loop
          } catch (playError) {
            addDebugMessage(`影片播放錯誤 (Video play error): ${playError instanceof Error ? playError.message : String(playError)}`);
            setError('無法播放相機畫面。請檢查相機是否被其他應用程式使用。 (Cannot play camera feed. Check if camera is used by another app.)');
            setCameraPermissionError(true); // Mark as camera related error
            setIsScanning(false); // Stop scanning state if play fails
            stopScan(); // Ensure camera resources are released
          }
        } else {
            addDebugMessage("Video ref is not available after obtaining stream.");
        }
      } catch (err) {
        let errorMessage = '無法存取相機。 (Cannot access camera.)';
        const errorDetails = err instanceof Error ? `${err.name} - ${err.message}` : String(err);
        addDebugMessage(`相機存取錯誤 (Camera access error): ${errorDetails}`);

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
            } else {
                errorMessage = `相機錯誤 (Camera error): ${err.message}`;
            }
        }
        setError(errorMessage);
        setCameraPermissionError(true); // Mark as camera related error
        setIsScanning(false);
      }
    } else {
      addDebugMessage("navigator.mediaDevices.getUserMedia 不支援 (not supported).");
      setError('您的瀏覽器不支援相機存取功能。 (Your browser does not support camera access.)');
      setCameraPermissionError(true); // Mark as camera related error
      setIsScanning(false);
    }
  };

  const stopScan = useCallback(() => {
    addDebugMessage("嘗試停止掃描 (Attempting to stop scan)...");
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      addDebugMessage("相機串流已停止 (Camera stream stopped).");
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  }, [addDebugMessage]);


  const tick = () => {
    if (!isScanning || !streamRef.current || !videoRef.current || !canvasRef.current) {
      return;
    }

    if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (ctx) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            if (imageData.data.some(channel => channel !== 0)) { // Check if not all black
                const code: QRCode | null = jsQR(imageData.data, imageData.width, imageData.height, {
                  inversionAttempts: 'dontInvert',
                });

                if (code) {
                  addDebugMessage(`jsQR 找到物件 (jsQR found object). Data: "${code.data}"`);
                  if (code.data && code.data.trim() !== "") {
                    addDebugMessage(`設定掃描資料 (Setting scanned data): "${code.data}"`);
                    setScannedData(code.data);
                    stopScan(); // Stop scanning after successful read
                    return; // Exit tick loop
                  } else {
                    addDebugMessage("jsQR 找到物件但資料為空或空白 (jsQR found object but data is empty or whitespace).");
                  }
                }
            }
        } catch (e) {
            addDebugMessage(`影像處理或解碼錯誤 (Image processing or decoding error): ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    // Continue scanning if still in scanning mode and stream is active
    if (isScanning && streamRef.current) {
        requestAnimationFrame(tick);
    }
  };

   // Effect for cleanup on unmount
   useEffect(() => {
    return () => {
      stopScan();
    };
  }, [stopScan]); // stopScan is memoized with addDebugMessage


  return (
    <div className="flex flex-col items-center space-y-6 w-full">
      {/* Debug Messages Area */}
      {debugMessages.length > 0 && (
        <div className="w-full max-w-sm p-3 mb-4 bg-slate-600 text-slate-200 text-xs rounded-md shadow max-h-40 overflow-y-auto font-mono">
          <p className="font-semibold mb-1 border-b border-slate-500 pb-1">除錯日誌 (Debug Log):</p>
          {debugMessages.map((msg, index) => (
            <div key={index} className="whitespace-pre-wrap break-all py-0.5">{msg}</div>
          ))}
        </div>
      )}

      {/* Video and Canvas Container */}
      <div className="w-full max-w-sm aspect-[4/3] bg-slate-700 rounded-lg overflow-hidden shadow-lg relative border-2 border-slate-600">
        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${isScanning ? 'block' : 'hidden'}`}
          muted
          autoPlay
          playsInline
        />
        {/* Initial placeholder / Error message when not scanning */}
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
        {/* Visual scanning indicator */}
        {isScanning && (
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-3/4 h-3/4 border-4 border-dashed border-purple-500 opacity-75 rounded-lg animate-pulse"></div>
            </div>
        )}
        {/* Hidden canvas for jsQR */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Control Buttons */}
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
            onClick={startScan} // Re-initiates the scan
            className="bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-white font-semibold py-3 px-8 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-amber-500 transition-all duration-150 ease-in-out"
        >
            重新掃描 (Rescan)
        </button>
      ) : ( // isScanning is true
        <button
          onClick={stopScan}
          className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-semibold py-3 px-8 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-rose-500 transition-all duration-150 ease-in-out"
        >
           <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-scan-line-off inline-block mr-2 align-middle"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" x2="17" y1="12" y2="12"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
          停止掃描 (Stop Scan)
        </button>
      )}

      {/* Display general errors, but not if it's a camera permission error that's already handled by the placeholder */}
      {error && !cameraPermissionError && (
        <div className="mt-4 p-4 bg-red-700 bg-opacity-50 border border-red-500 text-red-300 rounded-lg text-center w-full max-w-sm">
          <p className="font-semibold">錯誤 (Error)：</p>
          <p>{error}</p>
        </div>
      )}

      {/* Scanned Data Display and Actions */}
      {scannedData && (
        <div className="mt-4 p-6 bg-slate-700 rounded-lg shadow-inner w-full max-w-sm text-center">
          <h3 className="text-xl font-semibold text-slate-200 mb-3">掃描結果 (Scanned Result)：</h3>
          <p className="text-lg text-purple-300 break-all bg-slate-600 p-3 rounded-md">{scannedData}</p>
          <div className="mt-4 flex flex-col sm:flex-row justify-center items-center space-y-2 sm:space-y-0 sm:space-x-2">
            <button
                onClick={() => {
                    if (navigator.clipboard && scannedData) {
                        navigator.clipboard.writeText(scannedData)
                            .then(() => {
                                addDebugMessage('已複製到剪貼簿！ (Copied to clipboard!)');
                                alert('已複製到剪貼簿！ (Copied to clipboard!)')
                            })
                            .catch(err => {
                                addDebugMessage(`複製失敗 (Copy failed): ${err instanceof Error ? err.message : String(err)}`);
                                alert('複製失敗，請手動複製。 (Copy failed, please copy manually.)');
                            });
                    }
                }}
                className="w-full sm:w-auto bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-700 focus:ring-blue-400 transition-all duration-150 ease-in-out"
            >
                複製結果 (Copy Result)
            </button>
            {/* Use fetcher.Form for submitting to the action */}
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

      {/* Fetcher data display (for save operation feedback) */}
      {fetcher.data && (
        <div className={`mt-4 p-4 rounded-lg text-center w-full max-w-sm ${fetcher.data.success ? 'bg-green-700 bg-opacity-50 border border-green-500 text-green-300' : 'bg-red-700 bg-opacity-50 border border-red-500 text-red-300'}`}>
            <p>{fetcher.data.message || fetcher.data.error}</p>
        </div>
      )}
    </div>
  );
}
