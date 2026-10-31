import { NextRequest, NextResponse } from "next/server";
import { testProviderCredentials } from "@/lib/providerTestService";

// POST /api/admin/providers/test
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { id, providerCode, type, loginUrl, username, password } = body;

    if (!type || (type !== "kyc" && type !== "recharge")) {
      return NextResponse.json(
        { error: "Invalid test type. Expected 'kyc' or 'recharge'" },
        { status: 400 }
      );
    }

    const result = await testProviderCredentials({
      id,
      providerCode,
      type,
      loginUrl,
      username,
      password,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 });
  }
}
