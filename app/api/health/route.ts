import { NextResponse } from "next/server";
import { DatabaseConfigurationError, getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getPool().query("SELECT 1");
    return NextResponse.json({ status: "ok", database: "connected" });
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return NextResponse.json(
        { status: "error", message: error.message },
        { status: 503 }
      );
    }

    console.error("Database health check failed.");
    return NextResponse.json(
      { status: "error", message: "Database is unavailable. Check the server logs and database settings." },
      { status: 503 }
    );
  }
}
