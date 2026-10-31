import { NextRequest, NextResponse } from "next/server";
import { testProviderCredentials } from "@/lib/providerTestService";

// POST /api/admin/providers/[id]/test
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { type, loginUrl, username, password } = body;

    if (!type || (type !== "kyc" && type !== "recharge")) {
      return NextResponse.json(
        { error: "Invalid test type. Expected 'kyc' or 'recharge'" },
        { status: 400 }
      );
    }

    const result = await testProviderCredentials({
      id,
      type,
      loginUrl,
      username,
      password,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
