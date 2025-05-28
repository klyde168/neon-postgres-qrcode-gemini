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

  const addDebugMessage = useCallback((message: string, isError: boolean = false) => {
    const fullMessage = `[SCANNER ${new Date().toLocaleTimeString()}.${String(new Date().getMilliseconds()).padStart(3, '0')}] ${message}`;
    if (isError) console.error(fullMessage);
    else console.log(fullMessage);
    setDebugMessages(prev => [...prev.slice(Math.max(0, prev.length - 24)), fullMessage]);
  }, []);

  useEffect(() => {
    if (fetcher.data) {
        addDebugMessage(`Fetcher data received: success=${fetcher.data.success}, message=${fetcher.data.message}, error=${fetcher.data.error}, savedData=${fetcher.data.savedData ? fetcher.data.savedData.substring(0,30)+'...' : 'N/A'}`);
        if (fetcher.data.success && fetcher.data.savedData) {
            addDebugMessage(`資料成功儲存 (ID: ${fetcher.data.id})。準備觸發 localStorage 更新。`);
            try {
                const currentTimestamp = Date.now().toString();
                const dataToStore = fetcher.data.savedData;

                localStorage.setItem('latestScannedDataTimestamp', currentTimestamp);
                addDebugMessage(`localStorage set: latestScannedDataTimestamp = ${currentTimestamp}`);

                localStorage.setItem('latestScannedDataItem', dataToStore);
                addDebugMessage(`localStorage set: latestScannedDataItem = ${dataToStore.substring(0,30)}...`);

                addDebugMessage("準備手動派發 storage 事件...");
                window.dispatchEvent(new StorageEvent('storage', {
                    key: 'latestScannedDataTimestamp',
                    newValue: currentTimestamp,
                    oldValue: localStorage.getItem('latestScannedDataTimestamp'), // Pass the previous value if any
                    storageArea: localStorage,
                    url: window.location.href, // Optional, but good practice
                }));
                addDebugMessage("Storage 事件已派發 for latestScannedDataTimestamp.");

                 window.dispatchEvent(new StorageEvent('storage', { // Dispatch for the other key too, for robustness
                    key: 'latestScannedDataItem',
                    newValue: dataToStore,
                    oldValue: localStorage.getItem('latestScannedDataItem'),
                    storageArea: localStorage,
                    url: window.location.href,
                }));
                addDebugMessage("Storage 事件已派發 for latestScannedDataItem.");


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
    setDebugMessages(prev => ["日誌已清除..."]);
    frameCounter.current = 0;
    setIsScanning(true);
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
      addDebugMessage("useEffect[isScanning=true]: 開始設定相機.");
      isLoopActiveRef.current = false;
      const setupCameraAndStartLoop = async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          addDebugMessage("useEffect: navigator.mediaDevices.getUserMedia 不支援.", true);
          setError('您的瀏覽器不支援相機存取功能。');
          setCameraPermissionError(true);
          setIsScanning(false); return;
        }
        try {
          effectScopedStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          streamRef.current = effectScopedStream;
          addDebugMessage("useEffect: 相機串流已獲取.");
          if (videoRef.current) {
            videoRef.current.srcObject = effectScopedStream;
            const handlePlay = async () => {
              if (!videoRef.current) return;
              try {
                await videoRef.current.play();
                addDebugMessage("useEffect: 影片播放已開始.");
                frameCounter.current = 0;
                isLoopActiveRef.current = true;
                if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
                animationFrameId.current = requestAnimationFrame(tick);
              } catch (playError) {
                addDebugMessage(`useEffect: 影片播放錯誤: ${playError instanceof Error ? playError.message : String(playError)}`, true);
                stopScan("useEffect_play_error");
              }
            };
            videoRef.current.onloadedmetadata = () => { addDebugMessage("useEffect: 影片元數據已載入."); if(videoRef.current) handlePlay(); };
            videoRef.current.onerror = (e) => { addDebugMessage(`useEffect: 影片元素錯誤`, true); stopScan("useEffect_video_onerror"); };
            if (videoRef.current.readyState >= HTMLMediaElement.HAVE_METADATA) { addDebugMessage("useEffect: 影片元數據已預先載入."); if(videoRef.current) handlePlay(); }
          } else { addDebugMessage("useEffect: videoRef is null.", true); stopScan("useEffect_videoRef_null"); }
        } catch (err) { addDebugMessage(`useEffect: 相機存取錯誤: ${err instanceof Error ? err.message : String(err)}`, true); setError('無法存取相機。'); setCameraPermissionError(true); setIsScanning(false); }
      };
      setupCameraAndStartLoop();
      return () => {
        addDebugMessage("useEffect[isScanning=true] cleanup.");
        isLoopActiveRef.current = false;
        if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        if (effectScopedStream) effectScopedStream.getTracks().forEach(track => track.stop());
        if (streamRef.current === effectScopedStream) streamRef.current = null;
        if (videoRef.current) { videoRef.current.srcObject = null; videoRef.current.onloadedmetadata = null; videoRef.current.onerror = null; }
      };
    } else {
      addDebugMessage("useEffect[isScanning=false]: 確保停止.");
      isLoopActiveRef.current = false;
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
      if (videoRef.current) { videoRef.current.srcObject = null; if (videoRef.current.parentNode?.contains(videoRef.current)) { try { videoRef.current.load(); } catch (e) {} } }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScanning]);

  const tick = () => {
    if (!isLoopActiveRef.current) { return; }
    frameCounter.current++;
    if (!videoRef.current || !canvasRef.current || !streamRef.current || videoRef.current.readyState < videoRef.current.HAVE_ENOUGH_DATA || videoRef.current.videoWidth === 0) {
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
          const code: QRCode | null = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
          if (code && code.data && code.data.trim() !== "") {
            addDebugMessage(`Tick #${frameCounter.current}: jsQR 找到物件! Data: "${code.data.substring(0,30)}..."`);
            setScannedData(code.data);
            stopScan("qr_code_found");
            return;
          }
        }
      } catch (e) { addDebugMessage(`Tick #${frameCounter.current}: 影像處理/解碼錯誤: ${e instanceof Error ? e.message : String(e)}`, true); }
    }
    if (isLoopActiveRef.current) animationFrameId.current = requestAnimationFrame(tick);
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
                <div className="w-3/4 h-3/4 border-4 border-dashed border-purple-500 opacity-75 rounded-lg animate-pulse"></div>
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
          <p className="text-lg text-purple-300 break-all bg-slate-600 p-3 rounded-md">{scannedData}</p>
          <div className="mt-4 flex flex-col sm:flex-row justify-center items-center space-y-2 sm:space-y-0 sm:space-x-2">
            <button onClick={() => { if (navigator.clipboard && scannedData) { navigator.clipboard.writeText(scannedData).then(() => { addDebugMessage('已複製到剪貼簿！'); alert('已複製到剪貼簿！') }).catch(err => { addDebugMessage(`複製失敗: ${err instanceof Error ? err.message : String(err)}`, true); alert('複製失敗'); }); } }} className="w-full sm:w-auto bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md">複製結果</button>
            <fetcher.Form method="post" action="/scan" className="w-full sm:w-auto" onSubmit={(e) => { if (!scannedData) e.preventDefault(); }}>
                 <input type="hidden" name="scannedData" value={scannedData || ""} />
                 <button type="submit" disabled={fetcher.state === "submitting" || !scannedData} className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg shadow-md">{fetcher.state === "submitting" ? "儲存中..." : "儲存到資料庫"}</button>
            </fetcher.Form>
          </div>
        </div>
      )}
      {fetcher.data && (<div className={`mt-4 p-4 rounded-lg text-center w-full max-w-sm ${fetcher.data.success ? 'bg-green-700 bg-opacity-50 border border-green-500 text-green-300' : 'bg-red-700 bg-opacity-50 border border-red-500 text-red-300'}`}><p>{fetcher.data.message || fetcher.data.error}</p></div>)}
    </div>
  );
}
