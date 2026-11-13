import { NextRequest, NextResponse } from "next/server";

export async function POST(_req: NextRequest) {
  const response = NextResponse.json({
    success: true,
    message: "Logged out from reseller session",
  });

  response.cookies.delete("reseller_token");
  return response;
}
