import { createTransport, type Transporter } from "nodemailer";

export interface SubscriptionConfirmEmailData {
  to: string;
  customerName: string;
  planName: string;
  intervalDays: number;
  nextBillingDate: Date;
  subscriptionId: number;
}

export interface SubscriptionReminderEmailData {
  to: string;
  customerName: string;
  planName: string;
  intervalDays: number;
  nextBillingDate: Date;
  subscriptionId: number;
}

function getTransport(): Transporter | null {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !user || !pass || !from) return null;

  return createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

const FROM = process.env.SMTP_FROM ?? "noreply@thelabstandard.com";
const SITE_URL = process.env.SITE_URL ?? "https://thelabstandard.com";

export async function sendSubscriptionConfirmEmail(
  data: SubscriptionConfirmEmailData
): Promise<void> {
  const transport = getTransport();
  if (!transport) {
    console.log(
      `[email] SMTP not configured — skipping confirm email to ${data.to}`
    );
    return;
  }

  const intervalLabel =
    data.intervalDays === 30
      ? "Monthly"
      : data.intervalDays === 60
        ? "Every 60 Days"
        : `Every ${data.intervalDays} Days`;

  const nextDate = data.nextBillingDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const dashboardUrl = `${SITE_URL}/account/subscriptions?email=${encodeURIComponent(data.to)}`;

  await transport.sendMail({
    from: FROM,
    to: data.to,
    subject: `Subscription Confirmed — ${data.planName} | The Lab Standard`,
    text: `
Hello ${data.customerName},

Your subscription to ${data.planName} has been confirmed.

Interval: ${intervalLabel}
Next Shipment: ${nextDate}
Subscription ID: #${data.subscriptionId}

Manage your subscription at:
${dashboardUrl}

Thank you for your research.

— The Lab Standard
`.trim(),
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:Inter,sans-serif;background:#111;color:#e5e5e5;padding:40px 20px;max-width:600px;margin:0 auto;">
  <div style="background:#0d1117;border:1px solid #1e2a2a;border-radius:12px;padding:32px;">
    <h1 style="color:#29a98b;font-size:20px;margin:0 0 24px;">Subscription Confirmed</h1>
    <p style="color:#a3a3a3;margin:0 0 16px;">Hello ${data.customerName},</p>
    <p style="color:#a3a3a3;margin:0 0 24px;">Your subscription to <strong style="color:#e5e5e5;">${data.planName}</strong> is active.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
      <tr><td style="padding:8px 0;color:#a3a3a3;border-bottom:1px solid #1e2a2a;">Interval</td><td style="padding:8px 0;color:#e5e5e5;text-align:right;">${intervalLabel}</td></tr>
      <tr><td style="padding:8px 0;color:#a3a3a3;border-bottom:1px solid #1e2a2a;">Next Shipment</td><td style="padding:8px 0;color:#e5e5e5;text-align:right;">${nextDate}</td></tr>
      <tr><td style="padding:8px 0;color:#a3a3a3;">Subscription ID</td><td style="padding:8px 0;color:#e5e5e5;text-align:right;">#${data.subscriptionId}</td></tr>
    </table>
    <a href="${dashboardUrl}" style="display:inline-block;background:#29a98b;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Manage Subscription</a>
    <p style="color:#555;font-size:12px;margin:24px 0 0;">The Lab Standard — Research Peptides</p>
  </div>
</body>
</html>
    `.trim(),
  });
}

export interface ManagementLinkEmailData {
  to: string;
  managementUrl: string;
  expiresInMinutes: number;
}

export async function sendManagementLinkEmail(data: ManagementLinkEmailData): Promise<void> {
  const transport = getTransport();
  if (!transport) {
    console.log(
      `[email] SMTP not configured — management link URL: ${data.managementUrl}`
    );
    return;
  }

  await transport.sendMail({
    from: FROM,
    to: data.to,
    subject: `Subscription Management Link | The Lab Standard`,
    text: `
Click the link below to manage your subscriptions. This link expires in ${data.expiresInMinutes} minutes.

${data.managementUrl}

If you did not request this link, you can safely ignore this email.

— The Lab Standard
`.trim(),
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:Inter,sans-serif;background:#111;color:#e5e5e5;padding:40px 20px;max-width:600px;margin:0 auto;">
  <div style="background:#0d1117;border:1px solid #1e2a2a;border-radius:12px;padding:32px;">
    <h1 style="color:#29a98b;font-size:20px;margin:0 0 24px;">Subscription Management Access</h1>
    <p style="color:#a3a3a3;margin:0 0 16px;">Click the button below to manage your subscriptions.</p>
    <p style="color:#a3a3a3;margin:0 0 24px;font-size:13px;">This link expires in <strong style="color:#e5e5e5;">${data.expiresInMinutes} minutes</strong>.</p>
    <a href="${data.managementUrl}" style="display:inline-block;background:#29a98b;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Manage My Subscriptions</a>
    <p style="color:#555;font-size:12px;margin:24px 0 0;">If you did not request this link, you can safely ignore this email.</p>
  </div>
</body>
</html>
    `.trim(),
  });
}

export async function sendSubscriptionReminderEmail(
  data: SubscriptionReminderEmailData
): Promise<void> {
  const transport = getTransport();
  if (!transport) {
    console.log(
      `[email] SMTP not configured — skipping reminder email to ${data.to}`
    );
    return;
  }

  const nextDate = data.nextBillingDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const dashboardUrl = `${SITE_URL}/account/subscriptions?email=${encodeURIComponent(data.to)}`;

  await transport.sendMail({
    from: FROM,
    to: data.to,
    subject: `Upcoming Renewal in 3 Days — ${data.planName} | The Lab Standard`,
    text: `
Hello ${data.customerName},

Your ${data.planName} subscription will renew on ${nextDate}.

To skip or cancel, visit:
${dashboardUrl}

— The Lab Standard
`.trim(),
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:Inter,sans-serif;background:#111;color:#e5e5e5;padding:40px 20px;max-width:600px;margin:0 auto;">
  <div style="background:#0d1117;border:1px solid #1e2a2a;border-radius:12px;padding:32px;">
    <h1 style="color:#29a98b;font-size:20px;margin:0 0 24px;">Renewal Reminder</h1>
    <p style="color:#a3a3a3;margin:0 0 16px;">Hello ${data.customerName},</p>
    <p style="color:#a3a3a3;margin:0 0 24px;">Your <strong style="color:#e5e5e5;">${data.planName}</strong> subscription renews on <strong style="color:#e5e5e5;">${nextDate}</strong>.</p>
    <a href="${dashboardUrl}" style="display:inline-block;background:#29a98b;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Manage Subscription</a>
    <p style="color:#555;font-size:12px;margin:24px 0 0;">Subscription ID: #${data.subscriptionId}</p>
  </div>
</body>
</html>
    `.trim(),
  });
}

export interface PasswordResetEmailData {
  to: string;
  resetUrl: string;
  purpose: "reset" | "invite";
  expiresLabel: string; // e.g. "1 hour" / "21 days"
}

// Placeholder-guarded like the other senders: when SMTP is unconfigured the
// link is logged (never blocks — a migration/reset can proceed via the logged
// URL or a CSV export) rather than silently failing.
export async function sendPasswordResetEmail(
  data: PasswordResetEmailData
): Promise<void> {
  const transport = getTransport();
  const isInvite = data.purpose === "invite";
  if (!transport) {
    console.log(
      `[email] SMTP not configured — ${data.purpose} link for ${data.to}: ${data.resetUrl}`
    );
    return;
  }
  await transport.sendMail({
    from: FROM,
    to: data.to,
    subject: isInvite
      ? "Set your AT Lab Sourcing password"
      : "Reset your AT Lab Sourcing password",
    text: `
${
      isInvite
        ? "Your wholesale account is ready — set a password to sign in."
        : "You requested a password reset."
    } This link expires in ${data.expiresLabel}.

${data.resetUrl}

If you did not request this, you can safely ignore this email.

— AT Lab Sourcing
`.trim(),
  });
}

export interface ShipmentEmailData {
  to: string;
  orderId: string;
  trackingNumber: string | null;
  carrier: string | null;
}

export async function sendShipmentEmail(data: ShipmentEmailData): Promise<void> {
  const transport = getTransport();
  const trackingLine = data.trackingNumber
    ? `Tracking${data.carrier ? ` (${data.carrier})` : ""}: ${data.trackingNumber}`
    : "Tracking details will follow separately.";
  if (!transport) {
    console.log(
      `[email] SMTP not configured — shipment notice for order ${data.orderId} to ${data.to}: ${trackingLine}`
    );
    return;
  }
  const orderUrl = `${SITE_URL}/orders/${data.orderId}`;
  await transport.sendMail({
    from: FROM,
    to: data.to,
    subject: "Your AT Lab Sourcing order has shipped",
    text: `
Your order has shipped.

${trackingLine}

Track your order: ${orderUrl}

— AT Lab Sourcing
`.trim(),
  });
}

export interface FulfillmentEmailData {
  to: string;
  order: {
    id: string;
    channel: string;
    lineItems: { productName: string; variantName: string; quantity: number }[];
    shippingName: string;
    shippingAddress1: string;
    shippingAddress2?: string | null;
    shippingCity: string;
    shippingState: string;
    shippingZip: string;
    shippingCountry: string;
  };
}

// Sent to the dropshipper/fulfillment address when an order is confirmed — what
// to ship and where. Order-fulfilment detail only; no payment info.
export async function sendFulfillmentEmail(data: FulfillmentEmailData): Promise<void> {
  const o = data.order;
  const items = o.lineItems
    .map((li) => `  ${li.quantity} × ${li.productName} ${li.variantName}`)
    .join("\n");
  const address = [
    o.shippingName,
    o.shippingAddress1,
    o.shippingAddress2 || null,
    `${o.shippingCity}, ${o.shippingState} ${o.shippingZip}`,
    o.shippingCountry,
  ]
    .filter(Boolean)
    .join("\n");

  const transport = getTransport();
  if (!transport) {
    console.log(
      `[email] SMTP not configured — fulfillment notice for order ${o.id} to ${data.to}`
    );
    return;
  }
  await transport.sendMail({
    from: FROM,
    to: data.to,
    subject: `New order to ship — ${o.id} (${o.channel})`,
    text: `
A ${o.channel} order has been confirmed and is ready to ship.

Order: ${o.id}

Items:
${items}

Ship to:
${address}

— AT Lab Sourcing
`.trim(),
  });
}

export interface OrderConfirmationEmailData {
  to: string;
  order: {
    id: string;
    lineItems: { productName: string; variantName: string; quantity: number; unitPriceCents: number }[];
    totalCents: number;
  };
}

// Sent to the BUYER when their order is confirmed (payment settled). Order
// summary + a link to view it. No payment/secret detail.
export async function sendOrderConfirmationEmail(data: OrderConfirmationEmailData): Promise<void> {
  const o = data.order;
  const transport = getTransport();
  if (!transport) {
    console.log(
      `[email] SMTP not configured — order confirmation for ${o.id} to ${data.to}`
    );
    return;
  }
  const items = o.lineItems
    .map(
      (li) =>
        `  ${li.quantity} × ${li.productName} ${li.variantName} — $${(li.unitPriceCents / 100).toFixed(2)}`
    )
    .join("\n");
  const orderUrl = `${SITE_URL}/orders/${o.id}`;
  await transport.sendMail({
    from: FROM,
    to: data.to,
    subject: "Your AT Lab Sourcing order is confirmed",
    text: `
Thanks — your payment is confirmed and your order is being prepared.

Order: ${o.id}

Items:
${items}

Total: $${(o.totalCents / 100).toFixed(2)}

View your order: ${orderUrl}

All products are research use only (RUO) — not for human or animal consumption.

— AT Lab Sourcing
`.trim(),
  });
}
