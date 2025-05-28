// app/hooks/useSSE.ts
import { useEffect, useRef, useState, useCallback } from 'react';

export type SSEStatus = "disconnected" | "connecting" | "connected" | "error";

export interface SSEMessage {
  type: string;
  data?: any;
  message?: string;
  timestamp?: number;
}

export interface UseSSEConfig {
  url: string;
  enabled: boolean;
  onMessage?: (message: SSEMessage) => void;
  onStatusChange?: (status: SSEStatus) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  debug?: boolean;
}

export function useSSE({
  url,
  enabled,
  onMessage,
  onStatusChange,
  reconnectInterval = 5000,
  maxReconnectAttempts = 5,
  debug = false
}: UseSSEConfig) {
  const [status, setStatus] = useState<SSEStatus>("disconnected");
  const [lastMessage, setLastMessage] = useState<SSEMessage | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const log = useCallback((message: string, isError = false) => {
    if (!debug) return;
    const logMessage = `[SSE] ${message}`;
    if (isError) {
      console.error(logMessage);
    } else {
      console.log(logMessage);
    }
  }, [debug]);

  const updateStatus = useCallback((newStatus: SSEStatus) => {
    setStatus(newStatus);
    onStatusChange?.(newStatus);
    log(`Status changed to: ${newStatus}`);
  }, [onStatusChange, log]);

  const connect = useCallback(() => {
    if (!enabled) return;

    // Clear any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    updateStatus("connecting");
    log(`Connecting to ${url}`);

    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        log("Connection opened");
        updateStatus("connected");
        reconnectAttemptsRef.current = 0; // Reset reconnect attempts on successful connection
      };

      eventSource.onmessage = (event) => {
        try {
          const message: SSEMessage = JSON.parse(event.data);
          log(`Message received: ${message.type}`);
          setLastMessage(message);
          onMessage?.(message);
        } catch (error) {
          log(`Failed to parse message: ${error instanceof Error ? error.message : String(error)}`, true);
        }
      };

      eventSource.onerror = () => {
        log("Connection error occurred", true);
        updateStatus("error");
        
        // Attempt to reconnect if we haven't exceeded max attempts
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          log(`Scheduling reconnect attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts} in ${reconnectInterval}ms`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        } else {
          log(`Max reconnect attempts (${maxReconnectAttempts}) exceeded`, true);
        }
      };

      // Handle specific events
      eventSource.addEventListener('connected', (event) => {
        const data = JSON.parse(event.data);
        log(`Connected event: ${data.message}`);
      });

      eventSource.addEventListener('new_scan', (event) => {
        const data = JSON.parse(event.data);
        log(`New scan event: ID ${data.data?.id}`);
      });

      eventSource.addEventListener('heartbeat', () => {
        log('Heartbeat received');
      });

    } catch (error) {
      log(`Failed to create EventSource: ${error instanceof Error ? error.message : String(error)}`, true);
      updateStatus("error");
    }
  }, [enabled, url, updateStatus, log, onMessage, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    log("Disconnecting...");
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    reconnectAttemptsRef.current = 0;
    updateStatus("disconnected");
  }, [updateStatus, log]);

  const reconnect = useCallback(() => {
    log("Manual reconnect requested");
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect, log]);

  // Effect to manage connection based on enabled state
  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    status,
    lastMessage,
    reconnect,
    disconnect,
    reconnectAttempts: reconnectAttemptsRef.current,
    maxReconnectAttempts
  };
}