// app/hooks/useWebSocket.ts
import { useState, useEffect, useRef, useCallback } from 'react';

type WebSocketMessage = {
  type: string;
  data?: any;
  timestamp?: number;
  [key: string]: any;
};

type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketReturn {
  status: WebSocketStatus;
  sendMessage: (message: WebSocketMessage) => void;
  lastMessage: WebSocketMessage | null;
  connect: () => void;
  disconnect: () => void;
}

export function useWebSocket(url?: string): UseWebSocketReturn {
  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  const wsUrl = url || `ws://${typeof window !== 'undefined' ? window.location.host : 'localhost'}/ws`;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    console.log('[WebSocket Hook] Attempting to connect to:', wsUrl);
    setStatus('connecting');

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket Hook] Connected successfully');
        setStatus('connected');
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[WebSocket Hook] Received message:', message);
          setLastMessage(message);
        } catch (error) {
          console.error('[WebSocket Hook] Failed to parse message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('[WebSocket Hook] Connection closed:', event.code, event.reason);
        setStatus('disconnected');
        wsRef.current = null;

        // Auto-reconnect if not manually closed
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          console.log(`[WebSocket Hook] Reconnecting in ${reconnectDelay}ms... (attempt ${reconnectAttemptsRef.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket Hook] Connection error:', error);
        setStatus('error');
      };

    } catch (error) {
      console.error('[WebSocket Hook] Failed to create WebSocket:', error);
      setStatus('error');
    }
  }, [wsUrl]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }
    
    setStatus('disconnected');
    reconnectAttemptsRef.current = maxReconnectAttempts; // Prevent auto-reconnect
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
        console.log('[WebSocket Hook] Sent message:', message);
      } catch (error) {
        console.error('[WebSocket Hook] Failed to send message:', error);
      }
    } else {
      console.warn('[WebSocket Hook] Cannot send message, WebSocket not connected');
    }
  }, []);

  useEffect(() => {
    // Auto-connect when component mounts
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    status,
    sendMessage,
    lastMessage,
    connect,
    disconnect
  };
}