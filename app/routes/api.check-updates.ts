// app/routes/api.check-updates.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { pool } from "db.server";
import { randomUUID } from "node:crypto";

export async function loader({ request }: LoaderFunctionArgs) {
  const apiExecutionId = randomUUID().substring(0, 8);
  console.log(`[API-CHECK-UPDATES ${apiExecutionId}] Request received`);
  
  const url = new URL(request.url);
  const lastKnownIdStr = url.searchParams.get("lastKnownId") || "0";
  const lastKnownId = parseInt(lastKnownIdStr, 10) || 0;
  
  console.log(`[API-CHECK-UPDATES ${apiExecutionId}] Checking for updates - lastKnownId: ${lastKnownId}`);
  
  try {
    const client = await pool.connect();
    console.log(`[API-CHECK-UPDATES ${apiExecutionId}] Database connected`);
    
    try {
      const checkQuery = 'SELECT id, data, scanned_at FROM scanned_data ORDER BY id DESC LIMIT 1';
      const res = await client.query(checkQuery);
      
      console.log(`[API-CHECK-UPDATES ${apiExecutionId}] Query executed - rows: ${res.rows.length}`);
      
      if (res.rows.length > 0) {
        console.log(`[API-CHECK-UPDATES ${apiExecutionId}] Latest scan found: ID=${res.rows[0].id}, data="${res.rows[0].data?.substring(0,30)}..."`);
      } else {
        console.log(`[API-CHECK-UPDATES ${apiExecutionId}] No scan data found in database`);
      }
      
      const hasUpdate = res.rows.length > 0 && res.rows[0].id > lastKnownId;
      const latestScanId = res.rows.length > 0 ? res.rows[0].id : 0;
      
      console.log(`[API-CHECK-UPDATES ${apiExecutionId}] Update check result - lastKnown: ${lastKnownId}, latest: ${latestScanId}, hasUpdate: ${hasUpdate}`);
      
      const result = {
        hasUpdate,
        latestScanId,
        lastKnownId,
        debug: {
          queryRows: res.rows.length,
          latestData: res.rows.length > 0 ? res.rows[0].data?.substring(0,50) : null,
          timestamp: Date.now(),
          apiExecutionId
        }
      };
      
      console.log(`[API-CHECK-UPDATES ${apiExecutionId}] Returning result:`, result);
      
      return json(result, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    } finally {
      client.release();
      console.log(`[API-CHECK-UPDATES ${apiExecutionId}] Database connection released`);
    }
  } catch (dbError: any) {
    console.error(`[API-CHECK-UPDATES ${apiExecutionId}] Database error:`, dbError.message);
    
    const errorResult = { 
      hasUpdate: false, 
      latestScanId: 0, 
      lastKnownId,
      error: dbError.message,
      debug: {
        apiExecutionId,
        timestamp: Date.now()
      }
    };
    
    return json(errorResult, {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }
}