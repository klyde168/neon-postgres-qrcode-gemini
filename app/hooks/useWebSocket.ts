// app/hooks/useWebSocket.ts
import { useEffect, useRef, useState, useCallback } from 'react';

interface QRCodeData {
  qrCodeDataUrl: string;
  sourceText: string;
  timestamp: number;
}

interface QRCodeMessage {
  type: 'generate_uuid' | 'qr_code_generated' | 'error' | 'new_scan';
  data?: QRCodeData;
  error?: string;
  options?: {
    size?: string;
    errorCorrection?: string;
  };
  scanData?: string;
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export function useWebSocket(url: string) {
  const [qrData, setQrData] = useState<QRCodeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // 已經連接
    }

    setConnectionStatus('connecting');
    
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setConnectionStatus('connected');
        setError(null);
        
        // 清除重連定時器
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: QRCodeMessage = JSON.parse(event.data);
          console.log('WebSocket message received:', message);
          
          switch (message.type) {
            case 'qr_code_generated':
              if (message.data) {
                setQrData(message.data);
                setError(null);
              }
              break;
            case 'error':
              setError(message.error || '未知錯誤');
              break;
            default:
              console.log('Unknown message type:', message.type);
          }
        } catch (err) {
          console.error('Message parsing error:', err);
          setError('訊息解析錯誤');
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected', event.code, event.reason);
        setIsConnected(false);
        setConnectionStatus('disconnected');
        
        // 自動重連 (除非是正常關閉)
        if (event.code !== 1000) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('WebSocket 連接錯誤');
        setConnectionStatus('error');
      };
    } catch (err) {
      console.error('WebSocket connection error:', err);
      setError('無法建立 WebSocket 連接');
      setConnectionStatus('error');
    }
  }, [url]);

  const sendMessage = useCallback((message: Partial<QRCodeMessage>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    } else {
      console.warn('WebSocket is not connected');
      setError('WebSocket 未連接');
      return false;
    }
  }, []);

  const generateNewUUID = useCallback((options?: { size?: string; errorCorrection?: string }) => {
    const success = sendMessage({
      type: 'generate_uuid',
      options
    });
    
    if (!success) {
      setError('無法發送生成請求，請檢查連接狀態');
    }
  }, [sendMessage]);

  const requestGenerateUUID = useCallback(() => {
    generateNewUUID();
  }, [generateNewUUID]);

  const notifyNewScan = useCallback((data: string) => {
    sendMessage({
      type: 'new_scan',
      scanData: data
    });
  }, [sendMessage]);

  useEffect(() => {
    connect();

    return () => {
      // 清理函數
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
      }
    };
  }, [connect]);

  return {
    // 新的屬性 (符合您現有的程式碼)
    isConnected,
    connectionStatus,
    sendMessage,
    notifyNewScan,
    requestGenerateUUID,
    
    // 新增的屬性 (符合 generate.tsx 的需求)
    qrData,
    error,
    generateNewUUID
  };
}