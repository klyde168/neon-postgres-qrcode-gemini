// app/routes/events.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { pool } from "db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const lastId = url.searchParams.get("lastId");
  
  // Create SSE response
  const stream = new ReadableStream({
    start(controller) {
      let isActive = true;
      
      // Send initial connection message
      const send = (data: any) => {
        if (!isActive) return;
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(new TextEncoder().encode(message));
      };
      
      send({ type: "connected", message: "已連接到即時更新服務" });
      
      // Poll for new data every 2 seconds
      const pollInterval = setInterval(async () => {
        if (!isActive) return;
        
        try {
          const client = await pool.connect();
          try {
            let query = 'SELECT id, data, scanned_at FROM scanned_data ORDER BY id DESC LIMIT 1';
            let queryParams: any[] = [];
            
            if (lastId) {
              query = 'SELECT id, data, scanned_at FROM scanned_data WHERE id > $1 ORDER BY id DESC LIMIT 1';
              queryParams = [parseInt(lastId, 10)];
            }
            
            const result = await client.query(query, queryParams);
            
            if (result.rows.length > 0) {
              const row = result.rows[0];
              send({
                type: "new_scan",
                data: {
                  id: row.id,
                  content: row.data,
                  scannedAt: row.scanned_at,
                  timestamp: Date.now()
                }
              });
            }
          } finally {
            client.release();
          }
        } catch (error) {
          console.error("SSE polling error:", error);
          send({ 
            type: "error", 
            message: "資料庫連接錯誤" 
          });
        }
      }, 2000);
      
      // Heartbeat every 30 seconds
      const heartbeatInterval = setInterval(() => {
        if (!isActive) return;
        send({ type: "heartbeat", timestamp: Date.now() });
      }, 30000);
      
      // Cleanup on close
      request.signal?.addEventListener("abort", () => {
        isActive = false;
        clearInterval(pollInterval);
        clearInterval(heartbeatInterval);
        controller.close();
      });
    }
  });
  
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control"
    }
  });
}