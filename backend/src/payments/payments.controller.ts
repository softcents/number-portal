import { Controller, Get, Post, Patch, Param, Query, Body, Req, Res, Headers, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Request, Response } from 'express';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  async getPayments(@Query() query: any) {
    return await this.paymentsService.getPayments(query);
  }

  @Post('checkout')
  async checkout(@Body() body: any, @Req() req: Request) {
    const ip = req.headers['x-forwarded-for'] as string || req.ip;
    return await this.paymentsService.createCheckoutSession({
      customerId: body.customerId,
      orderId: body.orderId,
      rechargeOrderId: body.rechargeOrderId,
      amount: parseFloat(body.amount),
      customerName: body.customerName,
      customerEmail: body.customerEmail,
      customerPhone: body.customerPhone,
      ipAddress: ip,
    });
  }

  @Post('webhook')
  async webhook(@Body() body: any, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;
    const apiKey =
      (req.headers['mh-piprapay-api-key'] as string) ||
      (req.headers['mhs-piprapay-api-key'] as string) ||
      (req.headers['Mh-Piprapay-Api-Key'] as string) ||
      (req.headers['MHS-PIPRAPAY-API-KEY'] as string);

    const isValid = this.paymentsService.verifyWebhook(apiKey);
    if (!isValid) throw new UnauthorizedException('Invalid API key in webhook header');

    let metadata = body.metadata;
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch {}
    }

    const paymentId = metadata?.payment_id || body.payment_id || body.order_id || body.pp_id;
    if (!paymentId) throw new BadRequestException('Missing payment_id in webhook');

    const status = (body.status || '').toUpperCase();
    if (status === 'SUCCESS' || status === 'COMPLETED' || status === 'PAID') {
      return await this.paymentsService.processPaymentSuccess({
        paymentId,
        gatewayTransactionId: body.transaction_id || body.pp_id,
        rawResponse: body,
        ipAddress: ip,
      });
    } else {
      return await this.paymentsService.processPaymentFailure({
        paymentId,
        reason: body.message,
        rawResponse: body,
        ipAddress: ip,
      });
    }
  }

  @Get('verify/:id')
  async verifyPayment(@Param('id') id: string) {
    const payment = await this.paymentsService.getPaymentById(id);
    return {
      success: true,
      payment: {
        id: payment.id,
        orderId: payment.orderId,
        amount: Number(payment.amount),
        currency: payment.currency,
        status: payment.status,
        verificationStatus: payment.verificationStatus,
        gatewayTransactionId: payment.gatewayTransactionId,
        paidAt: payment.paidAt,
      },
    };
  }

  @Get('sandbox-checkout')
  async sandboxCheckout(@Query('paymentId') paymentId: string, @Query('action') action: string, @Res() res: Response) {
    if (!paymentId) return res.status(400).send('Missing paymentId');

    if (action === 'success') {
      await this.paymentsService.processPaymentSuccess({
        paymentId,
        gatewayTransactionId: `TXN-NEST-${Date.now()}`,
        rawResponse: { simulated: true, gateway: 'PIPRAPAY_SANDBOX_NEST' },
        actorId: 'sandbox_simulator',
      });
      return res.redirect(`http://localhost:3000/portal?payment=success&paymentId=${paymentId}`);
    }

    if (action === 'fail') {
      await this.paymentsService.processPaymentFailure({
        paymentId,
        reason: 'User cancelled in sandbox simulator',
      });
      return res.redirect(`http://localhost:3000/portal?payment=failed&paymentId=${paymentId}`);
    }

    const payment = await this.paymentsService.getPaymentById(paymentId);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>PipraPay Sandbox — NestJS</title>
  <style>
    body { margin:0; background:#090d16; font-family:sans-serif; color:#f8fafc; display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .card { background:#111827; border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:32px; width:100%; max-width:440px; box-shadow:0 20px 25px rgba(0,0,0,0.5); }
    .badge { display:inline-block; padding:4px 10px; border-radius:999px; font-size:11px; font-weight:700; background:rgba(245,158,11,0.15); color:#fbbf24; margin-bottom:16px; }
    .btn { display:block; padding:12px; border-radius:8px; font-weight:600; text-align:center; text-decoration:none; margin-top:10px; }
    .pay { background:#10b981; color:#fff; }
    .cancel { background:rgba(239,68,68,0.15); color:#f87171; border:1px solid rgba(239,68,68,0.3); }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">NestJS Gateway Sandbox</div>
    <h2>💳 PipraPay Checkout</h2>
    <p style="color:#94a3b8;font-size:13px">Payable: ৳ ${Number(payment.amount).toFixed(2)} ${payment.currency}</p>
    <a href="?paymentId=${payment.id}&action=success" class="btn pay">✓ Simulate Successful Payment (Auto-Activate)</a>
    <a href="?paymentId=${payment.id}&action=fail" class="btn cancel">✕ Simulate Cancelled / Failed Payment</a>
  </div>
</body>
</html>`;
    return res.type('html').send(html);
  }

  @Patch(':id/status')
  async updatePaymentStatus(
    @Param('id') id: string,
    @Body() body: { status: string; reason: string; notes?: string },
    @Req() req: Request,
  ) {
    const adminToken = req.cookies?.admin_token || 'admin_manual';
    const ip = req.headers['x-forwarded-for'] as string || req.ip;
    return await this.paymentsService.updatePaymentStatusByAdmin({
      paymentId: id,
      newStatus: body.status,
      reason: body.reason || 'Admin manual status change',
      notes: body.notes,
      adminId: adminToken,
      ipAddress: ip,
    });
  }
}
