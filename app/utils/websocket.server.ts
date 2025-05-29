// app/utils/websocket.server.ts
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';

interface QRCodeMessage {
  type: 'NEW_SCAN' | 'GENERATE_UUID' | 'HEARTBEAT';
  data?: string;
  timestamp: number;
  id: string;
}

class QRCodeWebSocketManager {
  private wss: WebSocketServer | null = null;
  private connections: Set<WebSocket> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  initialize(port: number = 8080) {
    if (this.wss) {
      console.log('WebSocket server already initialized');
      return;
    }

    console.log(`Initializing WebSocket server on port ${port}`);
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('New WebSocket connection established');
      this.connections.add(ws);

      // 發送歡迎訊息
      this.sendToClient(ws, {
        type: 'HEARTBEAT',
        timestamp: Date.now(),
        id: randomUUID()
      });

      ws.on('message', (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString()) as QRCodeMessage;
          console.log('Received WebSocket message:', data);
          this.handleMessage(ws, data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        console.log('WebSocket connection closed');
        this.connections.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.connections.delete(ws);
      });
    });

    // 每30秒發送心跳
    this.heartbeatInterval = setInterval(() => {
      this.broadcast({
        type: 'HEARTBEAT',
        timestamp: Date.now(),
        id: randomUUID()
      });
    }, 30000);

    console.log(`WebSocket server listening on port ${port}`);
  }

  private handleMessage(ws: WebSocket, message: QRCodeMessage) {
    switch (message.type) {
      case 'GENERATE_UUID':
        // 廣播 UUID 生成請求到所有連接的客戶端
        this.broadcast({
          type: 'GENERATE_UUID',
          timestamp: Date.now(),
          id: randomUUID()
        });
        break;
      
      case 'NEW_SCAN':
        // 廣播新掃描資料到所有連接的客戶端
        this.broadcast({
          type: 'NEW_SCAN',
          data: message.data,
          timestamp: Date.now(),
          id: randomUUID()
        });
        break;
        
      default:
        console.log('Unknown message type:', message.type);
    }
  }

  private sendToClient(ws: WebSocket, message: QRCodeMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  broadcast(message: QRCodeMessage) {
    console.log(`Broadcasting to ${this.connections.size} clients:`, message);
    this.connections.forEach((ws) => {
      this.sendToClient(ws, message);
    });
  }

  // 通知新的掃描資料
  notifyNewScan(data: string) {
    this.broadcast({
      type: 'NEW_SCAN',
      data,
      timestamp: Date.now(),
      id: randomUUID()
    });
  }

  // 通知生成新的 UUID
  notifyGenerateUUID() {
    this.broadcast({
      type: 'GENERATE_UUID',
      timestamp: Date.now(),
      id: randomUUID()
    });
  }

  close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.connections.forEach((ws) => {
      ws.close();
    });
    this.connections.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}

export const qrWebSocketManager = new QRCodeWebSocketManager();

// 在伺服器啟動時初始化 WebSocket
if (typeof window === 'undefined') {
  // 只在伺服器端執行
  const wsPort = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 8080;
  qrWebSocketManager.initialize(wsPort);
}