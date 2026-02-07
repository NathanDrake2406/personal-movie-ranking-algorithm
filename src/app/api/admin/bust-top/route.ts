import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { kvTopClear } from "@/db/queries-kv";

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return NextResponse.json(null, { status: 404 });

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  revalidatePath("/top");
  const kvKeysDeleted = await kvTopClear();

  return NextResponse.json({ ok: true, kvKeysDeleted });
}
