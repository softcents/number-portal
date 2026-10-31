import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processPaymentSuccess, processPaymentFailure } from "@/lib/piprapayService";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get("paymentId");
  const action = searchParams.get("action"); // 'success' | 'fail'

  if (!paymentId) {
    return new NextResponse("Missing paymentId", { status: 400 });
  }

  const p = prisma as any;
  const payment = await p.payment.findUnique({
    where: { id: paymentId },
    include: {
      order: {
        include: {
          items: {
            include: {
              number: true,
            },
          },
        },
      },
    },
  });

  if (!payment) {
    return new NextResponse("Payment not found", { status: 404 });
  }

  // If user clicked simulate action
  if (action === "success") {
    await processPaymentSuccess({
      paymentId: payment.id,
      gatewayTransactionId: `TXN-SB-${Date.now()}`,
      rawResponse: { simulated: true, gateway: "PIPRAPAY_SANDBOX" },
      actorId: "sandbox_simulator",
    });

    const returnUrl = new URL("/portal", req.url);
    returnUrl.searchParams.set("payment", "success");
    returnUrl.searchParams.set("paymentId", payment.id);
    if (payment.orderId) returnUrl.searchParams.set("orderId", payment.orderId);
    return NextResponse.redirect(returnUrl);
  }

  if (action === "fail") {
    await processPaymentFailure({
      paymentId: payment.id,
      reason: "User cancelled or payment failed in sandbox simulator",
      rawResponse: { simulated: true, outcome: "FAILED" },
    });

    const returnUrl = new URL("/portal", req.url);
    returnUrl.searchParams.set("payment", "failed");
    returnUrl.searchParams.set("paymentId", payment.id);
    return NextResponse.redirect(returnUrl);
  }

  // Otherwise, render a clean, professional sandbox checkout preview UI
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PipraPay Gateway — Sandbox Checkout</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #090d16;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #111827;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 32px;
      width: 100%;
      max-width: 440px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
      margin-bottom: 16px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .title {
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 6px 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .subtitle {
      color: #94a3b8;
      font-size: 13px;
      margin: 0 0 24px 0;
    }
    .detail-box {
      background: #1f2937;
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 24px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
    }
    .row .label { color: #94a3b8; }
    .row .val { font-weight: 600; color: #f8fafc; }
    .amount-row {
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 10px;
      margin-top: 4px;
    }
    .amount-val {
      font-size: 18px;
      font-weight: 700;
      color: #10b981;
    }
    .buttons {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .btn {
      display: block;
      width: 100%;
      text-align: center;
      padding: 12px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      box-sizing: border-box;
      transition: all 0.2s;
    }
    .btn-pay {
      background: linear-gradient(135deg, #10b981, #059669);
      color: white;
    }
    .btn-pay:hover { opacity: 0.95; transform: translateY(-1px); }
    .btn-cancel {
      background: rgba(239, 68, 68, 0.1);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.2);
    }
    .btn-cancel:hover { background: rgba(239, 68, 68, 0.2); }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">PipraPay Sandbox Environment</div>
    <div class="title">
      <span>💳 PipraPay Checkout</span>
    </div>
    <div class="subtitle">Complete your transaction securely via PipraPay Payment Gateway</div>

    <div class="detail-box">
      <div class="row">
        <span class="label">Payment ID</span>
        <span class="val">${payment.id.substring(0, 16)}...</span>
      </div>
      ${payment.order ? `
      <div class="row">
        <span class="label">Order Number</span>
        <span class="val">${payment.order.orderNumber}</span>
      </div>
      <div class="row">
        <span class="label">Items</span>
        <span class="val">${payment.order.items?.length || 1} Number(s)</span>
      </div>` : ''}
      <div class="row amount-row">
        <span class="label">Payable Amount</span>
        <span class="val amount-val">${Number(payment.amount).toFixed(2)} ${payment.currency}</span>
      </div>
    </div>

    <div class="buttons">
      <a href="?paymentId=${payment.id}&action=success" class="btn btn-pay">
        ✓ Simulate Successful Payment (Auto-Activate)
      </a>
      <a href="?paymentId=${payment.id}&action=fail" class="btn btn-cancel">
        ✕ Simulate Cancelled / Failed Payment
      </a>
    </div>
  </div>
</body>
</html>
  `;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
