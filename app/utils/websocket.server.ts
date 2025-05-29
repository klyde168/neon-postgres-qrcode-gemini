// app/utils/websocket.server.ts
import { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';

let wss: WebSocketServer | null = null;

export function setupWebSocketServer(server: any) {
  if (wss) return wss;

  wss = new WebSocketServer({ 
    server,
    path: '/ws'
  });

  wss.on('connection', (ws, request: IncomingMessage) => {
    console.log('[WebSocket] Client connected');
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connection',
      message: 'WebSocket connected successfully',
      timestamp: Date.now()
    }));

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('[WebSocket] Received:', message);
        
        // Broadcast to all connected clients except sender
        wss?.clients.forEach((client) => {
          if (client !== ws && client.readyState === 1) { // OPEN
            client.send(JSON.stringify({
              ...message,
              timestamp: Date.now()
            }));
          }
        });
      } catch (error) {
        console.error('[WebSocket] Message parsing error:', error);
      }
    });

    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected');
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error);
    });
  });

  return wss;
}

export function broadcastToAll(message: any) {
  if (!wss) return;
  
  const payload = JSON.stringify({
    ...message,
    timestamp: Date.now()
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(payload);
    }
  });
}