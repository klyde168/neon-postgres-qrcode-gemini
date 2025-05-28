// app/components/QrScanner.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import jsQR, { QRCode } from 'jsqr';
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
  const [debugMessages, setDebugMessages] = useState<string[]>([]);
  const frameCounter = useRef(0);
  const animationFrameId = useRef<number | null>(null);

  const addDebugMessage = useCallback((message: string, isError: boolean = false) => {
    const fullMessage = `[${new Date().toLocaleTimeString()}.${String(new Date().getMilliseconds()).padStart(3, '0')}] ${message}`;
    if (isError) console.error(fullMessage);
    else console.log(fullMessage);
    setDebugMessages(prev => [...prev.slice(Math.max(0, prev.length - 19)), fullMessage]);
  }, []);

  const startScan = async () => {
    addDebugMessage("嘗試開始掃描 (Attempting to start scan)...");
    setScannedData(null);
    setError(null);
    setCameraPermissionError(false);
    fetcher.data = undefined;
    setDebugMessages(prev => ["日誌已清除 (Logs cleared)..."]);
    frameCounter.current = 0;

    setIsScanning(true);
  };

  const stopScan = useCallback((caller?: string) => {
    addDebugMessage(`嘗試停止掃描 (Attempting to stop scan) from: ${caller || 'unknown'}`);
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
      addDebugMessage("已取消動畫幀 (Cancelled animation frame).");
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      addDebugMessage("相機串流已停止 (Camera stream stopped).");
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.onloadedmetadata = null;
      videoRef.current.onerror = null;
      if (videoRef.current.parentNode?.contains(videoRef.current)) {
        try { videoRef.current.load(); } catch (e) { /* ignore */ }
      }
    }
    setIsScanning(false);
  }, [addDebugMessage]);


  useEffect(() => {
    if (isScanning) {
      addDebugMessage("useEffect: isScanning is true. 嘗試啟動相機 (Attempting to start camera).");
      let localStream: MediaStream | null = null;

      const setupCameraAndStartTick = async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          addDebugMessage("navigator.mediaDevices.getUserMedia 不支援.", true);
          setError('您的瀏覽器不支援相機存取功能。');
          setCameraPermissionError(true);
          setIsScanning(false);
          return;
        }

        try {
          localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          streamRef.current = localStream;
          addDebugMessage("相機串流已獲取 (Camera stream obtained).");

          if (videoRef.current) {
            videoRef.current.srcObject = localStream;

            videoRef.current.onloadedmetadata = async () => {
              addDebugMessage("影片元數據已載入 (Video metadata loaded).");
              try {
                await videoRef.current!.play();
                addDebugMessage("影片播放已開始 (Video playback started).");
                frameCounter.current = 0;
                if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
                animationFrameId.current = requestAnimationFrame(tick);
              } catch (playError) {
                addDebugMessage(`影片播放錯誤 (onloadedmetadata): ${playError instanceof Error ? playError.message : String(playError)}`, true);
                setError('無法播放相機畫面。');
                setCameraPermissionError(true);
                stopScan("video_play_error_onloadedmetadata_useeffect");
              }
            };
            videoRef.current.onerror = (eventOrMessage) => { // Modified this line
              let errorMessageDetail = 'unknown video element error';
              if (typeof eventOrMessage === 'string') {
                errorMessageDetail = eventOrMessage;
              } else if (eventOrMessage && typeof eventOrMessage === 'object' && 'type' in eventOrMessage) {
                // Check if it's an Event-like object with a type property
                errorMessageDetail = (eventOrMessage as Event).type;
              }
              addDebugMessage(`影片元素錯誤: ${errorMessageDetail}`, true);
              setError('影片元素載入時發生錯誤。');
              setCameraPermissionError(true);
              stopScan("video_element_error_useeffect");
            };

            if (videoRef.current.readyState >= HTMLMediaElement.HAVE_METADATA) {
                 addDebugMessage("影片元數據已預先載入 (Video metadata already loaded in useEffect).");
                 try {
                    await videoRef.current.play();
                    addDebugMessage("影片播放已開始 (Video playback started - preloaded metadata in useEffect).");
                    frameCounter.current = 0;
                    if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
                    animationFrameId.current = requestAnimationFrame(tick);
                 } catch(playError) {
                    addDebugMessage(`影片播放錯誤 (preloaded metadata in useEffect): ${playError instanceof Error ? playError.message : String(playError)}`, true);
                    setError('無法播放相機畫面(預載入)。');
                    setCameraPermissionError(true);
                    stopScan("video_play_error_preloaded_useeffect");
                 }
            }
          } else {
            addDebugMessage("useEffect: Video ref is not available after obtaining stream.", true);
            stopScan("video_ref_null_useeffect");
          }
        } catch (err) {
          let errorMessage = '無法存取相機。';
          const errorDetails = err instanceof Error ? `${err.name} - ${err.message}` : String(err);
          addDebugMessage(`useEffect: 相機存取錯誤: ${errorDetails}`, true);
           if (err instanceof Error) {
            if (err.name === 'NotAllowedError') {
                errorMessage = '相機存取被拒絕。請檢查您的瀏覽器權限設定。';
            } else if (err.name === 'NotFoundError') {
                errorMessage = '找不到相機設備。';
            } else if (err.name === 'NotReadableError') {
                errorMessage = '相機目前無法使用，可能被其他應用程式佔用。';
            } else if (err.name === 'AbortError') {
                errorMessage = '相機請求被中止。';
            } else if (err.name === 'OverconstrainedError') {
                errorMessage = '找不到符合要求的相機設備。';
            } else if (err.name === 'SecurityError') {
                errorMessage = '相機存取因安全性問題被拒絕。';
            } else {
                errorMessage = `相機錯誤: ${err.message}`;
            }
        }
          setError(errorMessage);
          setCameraPermissionError(true);
          setIsScanning(false);
        }
      };

      setupCameraAndStartTick();

      return () => {
        addDebugMessage("useEffect cleanup for isScanning=true: 停止掃描 (Stopping scan).");
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            addDebugMessage("useEffect cleanup: Local camera stream stopped.");
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
             addDebugMessage("useEffect cleanup: Ref camera stream stopped.");
        }
        if (animationFrameId.current) {
          cancelAnimationFrame(animationFrameId.current);
          animationFrameId.current = null;
        }
      };
    } else {
      addDebugMessage("useEffect: isScanning is false. 執行停止掃描邏輯 (Executing stop scan logic).");
      stopScan("useEffect_isScanning_false");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScanning]); // addDebugMessage removed as it's stable due to useCallback with empty deps

  const tick = () => {
    frameCounter.current++;
    if (frameCounter.current <= 2 || frameCounter.current % 30 === 0) {
        addDebugMessage(
        `Tick #${frameCounter.current}: isScanningState=${isScanning}, stream=${!!streamRef.current}, videoEl=${!!videoRef.current?.srcObject}, canvasEl=${!!canvasRef.current}`
        );
    }

    if (!isScanning || !streamRef.current || !videoRef.current || !canvasRef.current) {
      if (frameCounter.current <= 5 || frameCounter.current % 30 === 0) {
        addDebugMessage(
            `Tick #${frameCounter.current} Exit Early: Conditions not met. isScanningState=${isScanning}, stream=${!!streamRef.current}`
        );
      }
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
                if (frameCounter.current % 2 === 0) {
                    // addDebugMessage(`Tick #${frameCounter.current}: 嘗試 jsQR 解碼...`);
                }
                const code: QRCode | null = jsQR(imageData.data, imageData.width, imageData.height, {
                  inversionAttempts: 'dontInvert',
                });

                if (code) {
                  addDebugMessage(`Tick #${frameCounter.current}: jsQR 找到物件! Data: "${code.data}" (length: ${code.data?.length})`);
                  if (code.data && code.data.trim() !== "") {
                    addDebugMessage(`Tick #${frameCounter.current}: 設定掃描資料: "${code.data}"`);
                    setScannedData(code.data);
                    stopScan("qr_code_found");
                    return;
                  } else {
                    // addDebugMessage(`Tick #${frameCounter.current}: jsQR 資料為空或空白。`);
                  }
                }
            }
        } catch (e) {
            addDebugMessage(`Tick #${frameCounter.current}: 影像處理/解碼錯誤: ${e instanceof Error ? e.message : String(e)}`, true);
        }
      }
    }

    if (isScanning && streamRef.current) {
        animationFrameId.current = requestAnimationFrame(tick);
    } else {
        addDebugMessage(`Tick #${frameCounter.current}: isScanning is false or stream lost, not scheduling next frame.`);
        if(animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        }
    }
  };

  useEffect(() => {
    return () => {
      addDebugMessage("元件卸載，最終清理 (Component unmounting, final cleanup).");
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
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
                    <p className="text-red-400">{error || '無法啟動相機。請檢查權限並重試。'}</p>
                ) : (
                    <p>點擊「開始掃描」以啟動相機。</p>
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
          開始掃描
        </button>
      ) : !isScanning && scannedData ? (
        <button
            onClick={startScan}
            className="bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-white font-semibold py-3 px-8 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-amber-500 transition-all duration-150 ease-in-out"
        >
            重新掃描
        </button>
      ) : (
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
