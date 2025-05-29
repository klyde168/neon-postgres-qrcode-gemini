// app/routes/scan.tsx 的修復版本 action 函數
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/react";
import { pool } from "~/utils/db.server";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const scannedDataValue = formData.get("scannedData");

  if (typeof scannedDataValue !== "string" || scannedDataValue.trim() === "") {
    return json({ success: false, error: "掃描到的資料是空的或無效的。" }, { status: 400 });
  }
  const scannedData = scannedDataValue;

  try {
    const client = await pool.connect();
    try {
      const queryText = 'INSERT INTO scanned_data(data) VALUES($1) RETURNING id, data, scanned_at';
      const res = await client.query(queryText, [scannedData]);
      
      const savedRecord = res.rows[0];
      const now = new Date();
      
      return json({
        success: true,
        id: savedRecord.id,
        savedData: savedRecord.data,
        message: `資料已成功儲存到資料庫！`,
        scannedAt: savedRecord.scanned_at,
        savedAt: now.toISOString()
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Database error in /scan action:", error);
    return json({ success: false, error: "儲存資料到資料庫時失敗。" }, { status: 500 });
  }
}