import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully",
  });

  response.cookies.set("customer_token", "", {
    httpOnly: true,
    expires: new Date(0),
    path: "/",
  });

  response.cookies.set("impersonation_session", "", {
    httpOnly: false,
    expires: new Date(0),
    path: "/",
  });

  return response;
}
