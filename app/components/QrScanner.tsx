// app/components/QrScanner.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import jsQR, { QRCode } from 'jsqr';
import { useFetcher } from '@remix-run/react';

export default function QrScanner() {
  const [scannedData, setScannedData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const isLoopActiveRef = useRef<boolean>(false);
  const [cameraPermissionError, setCameraPermissionError] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null); // Stores the active MediaStream
  const fetcher = useFetcher<{success: boolean; message?: string; error?: string; id?: number}>();
  const [debugMessages, setDebugMessages] = useState<string[]>([]);
  const frameCounter = useRef(0);
  const animationFrameId = useRef<number | null>(null);

  const addDebugMessage = useCallback((message: string, isError: boolean = false) => {
    const fullMessage = `[${new Date().toLocaleTimeString()}.${String(new Date().getMilliseconds()).padStart(3, '0')}] ${message}`;
    if (isError) console.error(fullMessage);
    else console.log(fullMessage);
    setDebugMessages(prev => [...prev.slice(Math.max(0, prev.length - 24)), fullMessage]);
  }, []);

  const startScan = () => { // Removed async as useEffect handles async setup
    addDebugMessage("startScan: 嘗試開始掃描 (User clicked Start Scan)...");
    setScannedData(null);
    setError(null);
    setCameraPermissionError(false);
    fetcher.data = undefined;
    setDebugMessages(prev => ["日誌已清除 (Logs cleared)..."]); // Start with a clean slate
    frameCounter.current = 0;
    setIsScanning(true); // This will trigger the useEffect
  };

  const stopScan = useCallback((caller?: string) => {
    addDebugMessage(`stopScan from ${caller || 'unknown'}: 嘗試停止掃描...`);
    isLoopActiveRef.current = false; // Signal the loop to stop *immediately*

    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
      addDebugMessage("stopScan: 已取消動畫幀.");
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null; // Clear the ref
      addDebugMessage("stopScan: 相機串流已停止.");
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.onloadedmetadata = null;
      videoRef.current.onerror = null;
      if (videoRef.current.parentNode?.contains(videoRef.current)) {
        try { videoRef.current.load(); } catch (e) { /* ignore */ }
      }
    }
    // This should be the last step to ensure cleanup based on isLoopActiveRef happens first
    if(isScanning){ // Only update state if it needs changing
        setIsScanning(false);
    }
  }, [addDebugMessage, isScanning]);


  useEffect(() => {
    // This effect manages the camera and scan loop based on `isScanning`
    if (isScanning) {
      addDebugMessage("useEffect[isScanning=true]: 開始設定相機及掃描迴圈.");
      isLoopActiveRef.current = false; // Ensure loop is not active until explicitly started

      const setupCameraAndStartLoop = async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          addDebugMessage("useEffect: navigator.mediaDevices.getUserMedia 不支援.", true);
          setError('您的瀏覽器不支援相機存取功能。');
          setCameraPermissionError(true);
          setIsScanning(false); // Trigger cleanup and state change
          return;
        }

        try {
          const currentStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          streamRef.current = currentStream; // Store the stream in the ref
          addDebugMessage("useEffect: 相機串流已獲取.");

          if (videoRef.current) {
            videoRef.current.srcObject = currentStream;

            const handlePlay = async () => {
              try {
                await videoRef.current!.play();
                addDebugMessage("useEffect: 影片播放已開始.");
                frameCounter.current = 0;
                isLoopActiveRef.current = true; // <<<< CRITICAL: Enable loop *just before* starting
                if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current); // Clear any old ones
                animationFrameId.current = requestAnimationFrame(tick);
                addDebugMessage(`useEffect: requestAnimationFrame(tick) 已調用. ID: ${animationFrameId.current}`);
              } catch (playError) {
                addDebugMessage(`useEffect: 影片播放錯誤: ${playError instanceof Error ? playError.message : String(playError)}`, true);
                setError('無法播放相機畫面。');
                setCameraPermissionError(true);
                stopScan("useEffect_play_error");
              }
            };

            videoRef.current.onloadedmetadata = () => {
              addDebugMessage("useEffect: 影片元數據已載入.");
              handlePlay();
            };
            videoRef.current.onerror = (e) => {
              let errorDetail = 'unknown video error';
              if (typeof e === 'string') errorDetail = e;
              else if (e && (e as Event).type) errorDetail = (e as Event).type;
              addDebugMessage(`useEffect: 影片元素錯誤: ${errorDetail}`, true);
              setError('影片元素載入時發生錯誤。');
              setCameraPermissionError(true);
              stopScan("useEffect_video_onerror");
            };

            // If metadata is already loaded
            if (videoRef.current.readyState >= HTMLMediaElement.HAVE_METADATA) {
              addDebugMessage("useEffect: 影片元數據已預先載入.");
              handlePlay();
            }
          } else {
            addDebugMessage("useEffect: videoRef is null after stream obtained.", true);
            stopScan("useEffect_videoRef_null");
          }
        } catch (err) {
          addDebugMessage(`useEffect: 相機存取錯誤: ${err instanceof Error ? `${err.name} - ${err.message}` : String(err)}`, true);
          setError('無法存取相機。'); // Generic message, specific ones logged
          setCameraPermissionError(true);
          setIsScanning(false); // Trigger cleanup
        }
      };

      setupCameraAndStartLoop();

      return () => {
        // Cleanup function for this effect instance
        addDebugMessage("useEffect[isScanning=true] cleanup: 執行中...");
        isLoopActiveRef.current = false; // Signal any running tick to stop

        if (animationFrameId.current) {
          cancelAnimationFrame(animationFrameId.current);
          animationFrameId.current = null;
          addDebugMessage("useEffect cleanup: 已取消動畫幀.");
        }

        // Important: Use the stream from streamRef.current for cleanup,
        // as `localStream` in setupCameraAndStartLoop is out of scope here.
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null; // Clear the ref
          addDebugMessage("useEffect cleanup: 相機串流已停止 (from streamRef).");
        }

        if (videoRef.current) {
          videoRef.current.srcObject = null;
          videoRef.current.onloadedmetadata = null;
          videoRef.current.onerror = null;
        }
        addDebugMessage("useEffect[isScanning=true] cleanup: 完成.");
      };
    } else {
      // This block runs when isScanning becomes false (e.g., after stopScan or successful scan)
      addDebugMessage("useEffect[isScanning=false]: 確保所有資源已釋放.");
      isLoopActiveRef.current = false; // Ensure loop is stopped
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
      if (streamRef.current) { // If a stream was active, stop it
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        addDebugMessage("useEffect[isScanning=false]: 相機串流已停止 (from streamRef).");
      }
       if (videoRef.current) { // Reset video element
          videoRef.current.srcObject = null;
          if (videoRef.current.parentNode?.contains(videoRef.current)) {
             try { videoRef.current.load(); } catch (e) { /* ignore */ }
          }
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScanning]); // addDebugMessage removed, it's stable

  const tick = () => {
    if (!isLoopActiveRef.current) {
      addDebugMessage(`Tick #${frameCounter.current + 1}: isLoopActiveRef is false. Loop terminating.`);
      animationFrameId.current = null; // Ensure no dangling ID
      return;
    }

    frameCounter.current++;
    if (frameCounter.current <= 3 || frameCounter.current % 20 === 0) {
        addDebugMessage(
        `Tick #${frameCounter.current}: LoopActive=${isLoopActiveRef.current}, State.isScanning=${isScanning}`
        );
    }

    if (!videoRef.current || !canvasRef.current || !streamRef.current) {
      addDebugMessage(`Tick #${frameCounter.current} Exit Early: Critical refs missing. LoopActive=${isLoopActiveRef.current}`, true);
      isLoopActiveRef.current = false;
      animationFrameId.current = null;
      return;
    }

    const video = videoRef.current;
    if (video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (ctx) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            if (imageData.data.some(channel => channel !== 0)) {
                const code: QRCode | null = jsQR(imageData.data, imageData.width, imageData.height, {
                  inversionAttempts: 'dontInvert',
                });

                if (code) {
                  addDebugMessage(`Tick #${frameCounter.current}: jsQR 找到物件! Data: "${code.data}"`);
                  if (code.data && code.data.trim() !== "") {
                    addDebugMessage(`Tick #${frameCounter.current}: 設定掃描資料: "${code.data}"`);
                    setScannedData(code.data);
                    stopScan("qr_code_found"); // This sets isLoopActiveRef=false & isScanning=false
                    return;
                  }
                }
            }
        } catch (e) {
            addDebugMessage(`Tick #${frameCounter.current}: 影像處理/解碼錯誤: ${e instanceof Error ? e.message : String(e)}`, true);
        }
      }
    }

    if (isLoopActiveRef.current) { // Check again before scheduling next frame
        animationFrameId.current = requestAnimationFrame(tick);
    } else {
        addDebugMessage(`Tick #${frameCounter.current}: isLoopActiveRef is false after processing. Not scheduling next frame.`);
        animationFrameId.current = null; // Ensure no dangling ID
    }
  };

  // Minimal unmount cleanup
  useEffect(() => {
    return () => {
      addDebugMessage("元件卸載，最終清理 (Component unmounting, final cleanup).");
      isLoopActiveRef.current = false;
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  return (
    <div className="flex flex-col items-center space-y-2 w-full">
      {debugMessages.length > 0 && (
        <div className="w-full max-w-sm p-2 mb-2 bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-md shadow max-h-60 overflow-y-auto font-mono">
          <p className="font-semibold mb-1 border-b border-slate-600 pb-1 text-slate-100">除錯日誌 (Debug Log):</p>
          {debugMessages.map((msg, index) => (
            <div key={index} className="whitespace-pre-wrap break-all py-0.5 even:bg-slate-800 px-1">{msg}</div>
          ))}
        </div>
      )}

      <div className="w-full max-w-sm aspect-[4/3] bg-slate-700 rounded-lg overflow-hidden shadow-lg relative border-2 border-slate-600">
        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${isScanning || scannedData ? 'block' : 'hidden'}`} // Keep video visible if data was just scanned
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
                    <p className="text-red-400">{error || '無法啟動相機。請檢查權限並重試。'}</p>
                ) : (
                    <p>點擊「開始掃描」以啟動相機。</p>
                )}
            </div>
        )}
        {isScanning && !scannedData && ( // Show scanning indicator only when actively scanning and no data yet
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
      ) : !isScanning && scannedData ? ( // Scanned data exists, show rescan button
        <button
            onClick={startScan}
            className="bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-white font-semibold py-3 px-8 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-amber-500 transition-all duration-150 ease-in-out"
        >
            重新掃描
        </button>
      ) : ( // isScanning is true, show stop button
        <button
          onClick={() => stopScan("stop_button_click")}
          className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-semibold py-3 px-8 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-rose-500 transition-all duration-150 ease-in-out"
        >
           <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-scan-line-off inline-block mr-2 align-middle"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" x2="17" y1="12" y2="12"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
          停止掃描
        </button>
      )}

      {error && !cameraPermissionError && (
        <div className="mt-4 p-4 bg-red-700 bg-opacity-50 border border-red-500 text-red-300 rounded-lg text-center w-full max-w-sm">
          <p className="font-semibold">錯誤：</p>
          <p>{error}</p>
        </div>
      )}

      {scannedData && (
        <div className="mt-4 p-6 bg-slate-700 rounded-lg shadow-inner w-full max-w-sm text-center">
          <h3 className="text-xl font-semibold text-slate-200 mb-3">掃描結果：</h3>
          <p className="text-lg text-purple-300 break-all bg-slate-600 p-3 rounded-md">{scannedData}</p>
          <div className="mt-4 flex flex-col sm:flex-row justify-center items-center space-y-2 sm:space-y-0 sm:space-x-2">
            <button
                onClick={() => {
                    if (navigator.clipboard && scannedData) {
                        navigator.clipboard.writeText(scannedData)
                            .then(() => {
                                addDebugMessage('已複製到剪貼簿！');
                                alert('已複製到剪貼簿！')
                            })
                            .catch(err => {
                                addDebugMessage(`複製失敗: ${err instanceof Error ? err.message : String(err)}`, true);
                                alert('複製失敗，請手動複製。');
                            });
                    }
                }}
                className="w-full sm:w-auto bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-700 focus:ring-blue-400 transition-all duration-150 ease-in-out"
            >
                複製結果
            </button>
            <fetcher.Form method="post" action="/scan" className="w-full sm:w-auto" onSubmit={(e) => { if (!scannedData) e.preventDefault(); }}>
                 <input type="hidden" name="scannedData" value={scannedData || ""} />
                 <button
                    type="submit"
                    disabled={fetcher.state === "submitting" || !scannedData}
                    className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-700 focus:ring-teal-400 transition-all duration-150 ease-in-out"
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
