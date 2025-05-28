// app/components/QrScanner.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import jsQR, { QRCode } from 'jsqr';
import { useFetcher } from '@remix-run/react';

interface ScanActionData {
  success: boolean;
  message?: string;
  error?: string;
  id?: number;
  savedData?: string;
}

export default function QrScanner() {
  const [scannedData, setScannedData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const isLoopActiveRef = useRef<boolean>(false);
  const [cameraPermissionError, setCameraPermissionError] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fetcher = useFetcher<ScanActionData>();
  const [debugMessages, setDebugMessages] = useState<string[]>([]);
  const frameCounter = useRef(0);
  const animationFrameId = useRef<number | null>(null);
  const [autoSaveAttempted, setAutoSaveAttempted] = useState<boolean>(false); // 新增：追蹤自動儲存嘗試

  const addDebugMessage = useCallback((message: string, isError: boolean = false) => {
    const fullMessage = `[SCANNER ${new Date().toLocaleTimeString()}.${String(new Date().getMilliseconds()).padStart(3, '0')}] ${message}`;
    if (isError) console.error(fullMessage);
    else console.log(fullMessage);
    setDebugMessages(prev => [...prev.slice(Math.max(0, prev.length - 24)), fullMessage]);
  }, []);

  // 監控 scannedData 變化
  useEffect(() => {
    addDebugMessage(`scannedData 變化: "${scannedData?.substring(0,50)}..." (length: ${scannedData?.length || 0})`);
    if (scannedData) {
      setAutoSaveAttempted(false); // 重置自動儲存標記
      addDebugMessage("重置自動儲存標記，準備進行自動儲存");
    }
  }, [scannedData, addDebugMessage]);

  // 監控 fetcher 狀態變化
  useEffect(() => {
    addDebugMessage(`Fetcher state 變化: ${fetcher.state}`);
    if (fetcher.state === "submitting") {
      addDebugMessage("正在提交表單到服務器...");
    } else if (fetcher.state === "idle") {
      addDebugMessage("Fetcher 處於閒置狀態");
    }
  }, [fetcher.state, addDebugMessage]);

  useEffect(() => {
    if (fetcher.data) {
        addDebugMessage(`Fetcher data received: success=${fetcher.data.success}, message=${fetcher.data.message}, error=${fetcher.data.error}, savedData=${fetcher.data.savedData ? fetcher.data.savedData.substring(0,30)+'...' : 'N/A'}`);
        if (fetcher.data.success && fetcher.data.savedData) {
            addDebugMessage(`資料成功儲存 (ID: ${fetcher.data.id})。準備觸發 localStorage 更新和事件。`);
            try {
                const currentTimestamp = Date.now().toString();
                const dataToStore = fetcher.data.savedData;

                // 先清除舊的 localStorage 標記，確保有變化
                const oldTimestamp = localStorage.getItem('latestScannedDataTimestamp');
                addDebugMessage(`Old timestamp: ${oldTimestamp}, New timestamp: ${currentTimestamp}`);

                localStorage.setItem('latestScannedDataTimestamp', currentTimestamp);
                addDebugMessage(`localStorage set: latestScannedDataTimestamp = ${currentTimestamp}`);

                localStorage.setItem('latestScannedDataItem', dataToStore);
                addDebugMessage(`localStorage set: latestScannedDataItem = ${dataToStore.substring(0,30)}...`);

                // 使用 setTimeout 確保 localStorage 設置完成後再觸發事件
                setTimeout(() => {
                    addDebugMessage("準備手動派發 storage 事件...");
                    
                    // 創建並派發 storage 事件
                    const storageEvent = new StorageEvent('storage', {
                        key: 'latestScannedDataTimestamp',
                        newValue: currentTimestamp,
                        oldValue: oldTimestamp,
                        storageArea: localStorage,
                        url: window.location.href,
                    });
                    
                    window.dispatchEvent(storageEvent);
                    addDebugMessage("Storage 事件已派發 for latestScannedDataTimestamp.");

                    // 也為 latestScannedDataItem 派發事件
                    const dataEvent = new StorageEvent('storage', {
                        key: 'latestScannedDataItem',
                        newValue: dataToStore,
                        oldValue: localStorage.getItem('latestScannedDataItem'),
                        storageArea: localStorage,
                        url: window.location.href,
                    });
                    
                    window.dispatchEvent(dataEvent);
                    addDebugMessage("Storage 事件已派發 for latestScannedDataItem.");

                    // 額外觸發一個自定義事件，確保 generate 頁面能夠監聽到
                    const customEvent = new CustomEvent('newScanComplete', {
                        detail: {
                            timestamp: currentTimestamp,
                            data: dataToStore,
                            id: fetcher.data?.id
                        }
                    });
                    window.dispatchEvent(customEvent);
                    addDebugMessage("Custom newScanComplete 事件已派發。");
                }, 100);

            } catch (e) {
                addDebugMessage(`設定 localStorage 或派發事件時發生錯誤: ${e instanceof Error ? e.message : String(e)}`, true);
            }
        } else if (fetcher.data && !fetcher.data.success && fetcher.data.error) {
            addDebugMessage(`儲存資料失敗: ${fetcher.data.error}`, true);
        }
    }
  }, [fetcher.data, addDebugMessage]);

  const startScan = () => {
    addDebugMessage("startScan: 嘗試開始掃描...");
    setScannedData(null);
    setError(null);
    setCameraPermissionError(false);
    setDebugMessages([]);  // 完全清空日誌
    frameCounter.current = 0;
    
    // 確保停止之前的掃描
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    isLoopActiveRef.current = false;
    
    // 設置掃描狀態
    setIsScanning(true);
    addDebugMessage("掃描狀態已設置為 true，準備初始化相機...");
  };

  const stopScan = useCallback((caller?: string) => {
    addDebugMessage(`stopScan from ${caller || 'unknown'}: 嘗試停止掃描...`);
    isLoopActiveRef.current = false;
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.onloadedmetadata = null;
      videoRef.current.onerror = null;
      if (videoRef.current.parentNode?.contains(videoRef.current)) {
        try { videoRef.current.load(); } catch (e) { /* ignore */ }
      }
    }
    if(isScanning){
        setIsScanning(false);
    }
  }, [addDebugMessage, isScanning]);

  useEffect(() => {
    let effectScopedStream: MediaStream | null = null;
    
    if (isScanning) {
      addDebugMessage("useEffect[isScanning=true]: 開始設定相機...");
      
      const setupCameraAndStartLoop = async () => {
        try {
          addDebugMessage("檢查瀏覽器相機支援...");
          
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            addDebugMessage("navigator.mediaDevices.getUserMedia 不支援.", true);
            setError('您的瀏覽器不支援相機存取功能。');
            setCameraPermissionError(true);
            setIsScanning(false);
            return;
          }

          addDebugMessage("正在請求相機權限...");
          
          // 嘗試獲取相機權限
          effectScopedStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 }
            } 
          });
          
          streamRef.current = effectScopedStream;
          addDebugMessage("相機串流已獲取，設置影片元素...");
          
          if (!videoRef.current) {
            addDebugMessage("videoRef.current is null!", true);
            setError('影片元素未找到');
            setIsScanning(false);
            return;
          }

          const video = videoRef.current;
          video.srcObject = effectScopedStream;
          
          const handleLoadedMetadata = () => {
            addDebugMessage("影片元數據已載入，開始播放...");
            video.play()
              .then(() => {
                addDebugMessage("影片播放成功，啟動掃描迴圈...");
                frameCounter.current = 0;
                isLoopActiveRef.current = true;
                if (animationFrameId.current) {
                  cancelAnimationFrame(animationFrameId.current);
                }
                animationFrameId.current = requestAnimationFrame(tick);
              })
              .catch((playError) => {
                addDebugMessage(`影片播放錯誤: ${playError.message}`, true);
                setError('無法播放相機畫面');
                stopScan("play_error");
              });
          };

          const handleVideoError = (event: string | Event) => {
            const errorType = typeof event === 'string' ? event : event.type;
            addDebugMessage(`影片元素錯誤: ${errorType}`, true);
            setError('相機初始化失敗');
            stopScan("video_error");
          };

          video.onloadedmetadata = handleLoadedMetadata;
          video.onerror = handleVideoError;
          
          // 如果元數據已經載入，直接處理
          if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
            addDebugMessage("影片元數據已預先載入，直接開始播放...");
            handleLoadedMetadata();
          }
          
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          addDebugMessage(`相機存取錯誤: ${errorMessage}`, true);
          
          if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
            setError('相機權限被拒絕，請允許使用相機。');
            setCameraPermissionError(true);
          } else if (errorMessage.includes('NotFoundError')) {
            setError('找不到相機設備。');
            setCameraPermissionError(true);
          } else {
            setError('無法存取相機：' + errorMessage);
            setCameraPermissionError(true);
          }
          
          setIsScanning(false);
        }
      };

      setupCameraAndStartLoop();

      // Cleanup function
      return () => {
        addDebugMessage("useEffect[isScanning=true] cleanup - 清理相機資源...");
        isLoopActiveRef.current = false;
        
        if (animationFrameId.current) {
          cancelAnimationFrame(animationFrameId.current);
          animationFrameId.current = null;
        }
        
        if (effectScopedStream) {
          effectScopedStream.getTracks().forEach(track => {
            addDebugMessage(`停止影片軌道: ${track.kind}`);
            track.stop();
          });
        }
        
        if (streamRef.current === effectScopedStream) {
          streamRef.current = null;
        }
        
        if (videoRef.current) {
          videoRef.current.srcObject = null;
          videoRef.current.onloadedmetadata = null;
          videoRef.current.onerror = null;
        }
      };
    } else {
      addDebugMessage("useEffect[isScanning=false]: 確保停止.");
      isLoopActiveRef.current = false;
      
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        if (videoRef.current.parentNode?.contains(videoRef.current)) {
          try { 
            videoRef.current.load(); 
          } catch (e) { 
            // ignore load errors
          }
        }
      }
    }
  }, [isScanning, addDebugMessage, stopScan]);

  const tick = () => {
    if (!isLoopActiveRef.current) { 
      addDebugMessage(`Tick stopped: isLoopActiveRef=${isLoopActiveRef.current}`);
      return; 
    }
    
    frameCounter.current++;
    
    // 每 30 frames 輸出一次狀態訊息
    if (frameCounter.current % 30 === 0) {
      addDebugMessage(`Tick #${frameCounter.current}: 正在處理影像...`);
    }
    
    if (!videoRef.current || !canvasRef.current || !streamRef.current) {
      if (frameCounter.current % 30 === 0) {
        addDebugMessage(`Tick #${frameCounter.current}: 等待元素準備 - video:${!!videoRef.current}, canvas:${!!canvasRef.current}, stream:${!!streamRef.current}`);
      }
      if (isLoopActiveRef.current) animationFrameId.current = requestAnimationFrame(tick);
      return;
    }
    
    if (videoRef.current.readyState < videoRef.current.HAVE_ENOUGH_DATA || videoRef.current.videoWidth === 0) {
      if (frameCounter.current % 30 === 0) {
        addDebugMessage(`Tick #${frameCounter.current}: 等待影片資料 - readyState:${videoRef.current.readyState}, width:${videoRef.current.videoWidth}`);
      }
      if (isLoopActiveRef.current) animationFrameId.current = requestAnimationFrame(tick);
      return;
    }
    
    const video = videoRef.current;
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
            inversionAttempts: 'dontInvert' 
          });
          
          if (code && code.data && code.data.trim() !== "") {
            addDebugMessage(`✅ Tick #${frameCounter.current}: QR Code 掃描成功! Data: "${code.data.substring(0,50)}..."`);
            addDebugMessage(`QR Code 詳細信息 - 長度: ${code.data.length}, 類型: ${typeof code.data}`);
            setScannedData(code.data);
            stopScan("qr_code_found");
            return;
          }
        }
      } catch (e) { 
        addDebugMessage(`Tick #${frameCounter.current}: 影像處理/解碼錯誤: ${e instanceof Error ? e.message : String(e)}`, true); 
      }
    }
    
    if (isLoopActiveRef.current) {
      animationFrameId.current = requestAnimationFrame(tick);
    }
  };

  useEffect(() => {
    return () => {
      addDebugMessage("元件卸載，最終清理.");
      isLoopActiveRef.current = false;
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center space-y-2 w-full">
      {debugMessages.length > 0 && (
        <div className="w-full max-w-sm p-2 mb-2 bg-slate-950 border border-slate-700 text-slate-400 text-xs rounded-md shadow-inner max-h-40 overflow-y-auto font-mono">
          <p className="font-semibold text-slate-300 mb-1 border-b border-slate-700 pb-1">掃描器日誌:</p>
          {debugMessages.map((msg, index) => (
            <div key={index} className="whitespace-pre-wrap break-all py-0.5 even:bg-slate-900 px-1">{msg.substring(msg.indexOf(']') + 2)}</div>
          ))}
        </div>
      )}
      <div className="w-full max-w-sm aspect-[4/3] bg-slate-700 rounded-lg overflow-hidden shadow-lg relative border-2 border-slate-600">
        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${isScanning || (scannedData && !isScanning) ? 'block' : 'hidden'}`}
          muted autoPlay playsInline
        />
        {(!isScanning && !scannedData) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-camera-off mb-3 opacity-50"><line x1="2" x2="22" y1="2" y2="22"/><path d="M10.36 10.36a5 5 0 0 0-5.72-5.72"/><path d="M14.43 14.43a5 5 0 0 0 5.72 5.72"/><path d="M14.43 2.28a5.01 5.01 0 0 1 3.34 1.07l2.28 2.28"/><path d="M2.28 14.43a5.01 5.01 0 0 1-1.07-3.34l-.01-2.28"/><path d="m2 2 20 20"/><path d="M17.5 17.5 14 14"/></svg>
                {cameraPermissionError ? (<p className="text-red-400">{error || '無法啟動相機。'}</p>) : (<p>點擊「開始掃描」</p>)}
            </div>
        )}
        {isScanning && !scannedData && (
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {/* 大型掃描框 - 佔據 90% 的空間 */}
                <div className="w-[90%] h-[90%] border-4 border-dashed border-purple-500 opacity-80 rounded-xl animate-pulse relative">
                  {/* 四個角落的掃描指示器 */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-purple-400"></div>
                  <div className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-purple-400"></div>
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-purple-400"></div>
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-purple-400"></div>
                  
                  {/* 中央提示文字 */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-black bg-opacity-50 text-white px-3 py-1 rounded-md text-sm">
                      將 QR Code 對準此區域
                    </div>
                  </div>
                </div>
            </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>
      {!isScanning && !scannedData ? (
        <button onClick={startScan} className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold py-3 px-8 rounded-lg shadow-md"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-scan-line inline-block mr-2 align-middle"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/></svg>開始掃描</button>
      ) : !isScanning && scannedData ? (
        <button onClick={startScan} className="bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-white font-semibold py-3 px-8 rounded-lg shadow-md">重新掃描</button>
      ) : (
        <button onClick={() => stopScan("stop_button_click")} className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-semibold py-3 px-8 rounded-lg shadow-md"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-scan-line-off inline-block mr-2 align-middle"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" x2="17" y1="12" y2="12"/><line x1="2" x2="22" y1="2" y2="22"/></svg>停止掃描</button>
      )}
      {error && !cameraPermissionError && (<div className="mt-4 p-4 bg-red-700 bg-opacity-50 border border-red-500 text-red-300 rounded-lg text-center w-full max-w-sm"><p className="font-semibold">錯誤：</p><p>{error}</p></div>)}
      {scannedData && (
        <div className="mt-4 p-6 bg-slate-700 rounded-lg shadow-inner w-full max-w-sm text-center">
          <h3 className="text-xl font-semibold text-slate-200 mb-3">掃描結果：</h3>
          <p className="text-lg text-purple-300 break-all bg-slate-600 p-3 rounded-md mb-4">{scannedData}</p>
          
          {/* 顯示自動儲存狀態 */}
          {!autoSaveAttempted && (
            <div className="mb-4 p-3 bg-orange-700 bg-opacity-50 border border-orange-500 text-orange-300 rounded-lg">
              <div className="flex items-center justify-center">
                <svg className="mr-2 h-5 w-5 text-orange-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
                </svg>
                ⏳ 準備自動儲存...
              </div>
            </div>
          )}
          
          {/* 顯示儲存進行中狀態 */}
          {autoSaveAttempted && fetcher.state === "submitting" && (
            <div className="mb-4 p-3 bg-blue-700 bg-opacity-50 border border-blue-500 text-blue-300 rounded-lg">
              <div className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                🚀 正在自動儲存到資料庫...
              </div>
            </div>
          )}
          
          {/* 顯示儲存成功訊息 */}
          {autoSaveAttempted && fetcher.data && fetcher.data.success && (
            <div className="mb-4 p-3 bg-green-700 bg-opacity-50 border border-green-500 text-green-300 rounded-lg">
              <div className="flex items-center justify-center">
                <svg className="mr-2 h-5 w-5 text-green-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                </svg>
                ✅ 已自動儲存到資料庫！(ID: {fetcher.data.id})
              </div>
            </div>
          )}
          
          {/* 顯示儲存失敗訊息 */}
          {autoSaveAttempted && fetcher.data && !fetcher.data.success && fetcher.data.error && (
            <div className="mb-4 p-3 bg-red-700 bg-opacity-50 border border-red-500 text-red-300 rounded-lg">
              <div className="flex items-center justify-center">
                <svg className="mr-2 h-5 w-5 text-red-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
                </svg>
                ❌ 自動儲存失敗：{fetcher.data.error}
              </div>
              <button 
                onClick={() => {
                  addDebugMessage("手動重試自動儲存...");
                  setAutoSaveAttempted(false);
                }}
                className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm"
              >
                重試儲存
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}