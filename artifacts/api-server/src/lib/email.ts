import { logger } from "./logger";
import nodemailer, { type Transporter } from "nodemailer";

const APP_NAME = process.env.APP_NAME || "Huce Autos";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@huceautos.com";

function frontendBaseUrl() {
  const fallback =
    process.env.NODE_ENV === "production"
      ? "https://huceautos.com"
      : "http://localhost:5173";
  return (process.env.FRONTEND_URL || process.env.ALLOWED_ORIGIN || fallback).replace(/\/$/, "");
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(amountNaira: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(amountNaira);
}

interface TemplateOptions {
  title: string;
  heading: string;
  preheader?: string;
  greetingName?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

function renderBaseTemplate(opts: TemplateOptions) {
  const appUrl = frontendBaseUrl();
  const logoUrl = `${appUrl}/huce-automart-logo.png`;
  const safeName = escapeHtml(opts.greetingName || "there");
  const safeHeading = escapeHtml(opts.heading);
  const safeTitle = escapeHtml(opts.title);
  const safePreheader = escapeHtml(opts.preheader || opts.heading);
  const ctaHtml =
    opts.ctaLabel && opts.ctaUrl
      ? `<p style="margin:28px 0 0;">
           <a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;background:#005f3a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;">
             ${escapeHtml(opts.ctaLabel)}
           </a>
         </p>`
      : "";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      body { margin:0; padding:0; background:#eef7f2; font-family:Arial,Helvetica,sans-serif; color:#2f3f66; }
      .wrap { max-width:600px; margin:0 auto; padding:20px 16px; }
      .card { background:#ffffff; border-radius:12px; padding:28px 30px; }
      .h1 { margin:0 0 16px; color:#111827; font-size:24px; line-height:1.3; font-weight:800; }
      .p { margin:0 0 12px; font-size:15px; line-height:1.6; color:#45547a; }
      .small { margin:0; font-size:13px; color:#4b5563; line-height:1.5; }
      ul { margin:10px 0 14px 22px; padding:0; }
      li { margin:6px 0; font-size:15px; line-height:1.5; color:#45547a; }
      @media (max-width: 600px) {
        .card { padding:20px 16px; }
        .h1 { font-size:20px; }
        .p, li { font-size:14px; }
      }
    </style>
  </head>
  <body>
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safePreheader}</div>
    <div class="wrap">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
        <img src="${logoUrl}" alt="${escapeHtml(APP_NAME)}" style="height:46px;width:auto;display:block;" />
      </div>
      <div class="card">
        <h1 class="h1">${safeHeading}</h1>
        <p class="p"><strong>Hi ${safeName},</strong></p>
        ${opts.bodyHtml}
        ${ctaHtml}
      </div>
      <div style="padding:22px 8px 0;">
        <p class="small" style="margin-bottom:12px;"><strong>${escapeHtml(APP_NAME)} at the touch of a button!</strong><br/>Download our app for Android & iOS.</p>
        <div style="margin-bottom: 20px;">
          <a href="#" style="display:inline-block; margin-right:8px;">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Google_Play_Store_badge_EN.svg/135px-Google_Play_Store_badge_EN.svg.png" alt="Get it on Google Play" style="height:36px; width:auto; border-radius:4px;" />
          </a>
          <a href="#" style="display:inline-block;">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Download_on_the_App_Store_Badge.svg/135px-Download_on_the_App_Store_Badge.svg.png" alt="Download on the App Store" style="height:36px; width:auto; border-radius:4px;" />
          </a>
        </div>
        <p class="small">
          Questions or FAQ? Contact us at <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:#046c4e;font-weight:700;">${escapeHtml(SUPPORT_EMAIL)}</a>.
        </p>
        <p class="small" style="margin-top:12px;color:#046c4e;font-weight:700;">© ${new Date().getFullYear()} ${escapeHtml(APP_NAME)}</p>
      </div>
    </div>
  </body>
</html>`;
}

async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  metadata?: Record<string, unknown>;
}) {
  const provider = (process.env.EMAIL_PROVIDER || "").toLowerCase();
  const fromName = process.env.EMAIL_FROM_NAME || APP_NAME;
  const fromEmailAddress = process.env.EMAIL_FROM || "noreply@huceautos.com";
  const fromEmail = `${fromName} <${fromEmailAddress}>`;
  const smtpConfigured =
    !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;

  if (provider === "resend" && process.env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend failed (${response.status}): ${body.slice(0, 300)}`);
    }
    logger.info({ to: args.to, subject: args.subject, provider: "resend" }, "[EMAIL] sent");
    return;
  }

  if ((provider === "smtp" || (!provider && smtpConfigured)) && smtpConfigured) {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure =
      String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;
    const transport: Transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transport.sendMail({
      from: fromEmail,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    logger.info({ to: args.to, subject: args.subject, provider: "smtp" }, "[EMAIL] sent");
    return;
  }

  // Fallback mode for environments without an email provider.
  logger.info(
    { to: args.to, subject: args.subject, provider: "log-only", ...(args.metadata ?? {}) },
    "[EMAIL] rendered (provider not configured)",
  );
}

export async function sendWelcomeEmail(params: {
  email: string;
  firstName: string;
}) {
  const appUrl = frontendBaseUrl();
  const html = renderBaseTemplate({
    title: `Welcome to ${APP_NAME}`,
    heading: `Welcome to ${APP_NAME}\nLet’s Get Started!`,
    preheader: "Welcome aboard. Your account is ready.",
    greetingName: params.firstName,
    bodyHtml: `
      <p class="p">Welcome to ${escapeHtml(APP_NAME)}! We're excited to have you on board.</p>
      <p class="p" style="margin-bottom:0;">Here’s what you can do next:</p>
      <ul>
        <li>Browse and find your dream car.</li>
        <li>List your vehicle for thousands of potential buyers to see.</li>
        <li>Enjoy a secure and seamless car trading experience.</li>
      </ul>
      <p class="p">Start exploring today and make the most out of ${escapeHtml(APP_NAME)}.</p>
      <p class="p" style="margin-top:18px;">Thanks for joining us,<br/>The ${escapeHtml(APP_NAME)} Team</p>
    `,
    ctaLabel: "Get Started Now",
    ctaUrl: `${appUrl}/cars`,
  });

  await sendEmail({
    to: params.email,
    subject: `Welcome to ${APP_NAME}`,
    html,
    metadata: { template: "welcome" },
  });
}

export async function sendOtpEmail(
  email: string,
  otp: string,
  purpose: "email_verify" | "password_reset",
  firstName = "there",
): Promise<void> {
  const subject =
    purpose === "email_verify"
      ? `Your OTP for ${APP_NAME} Verification`
      : `Your OTP for ${APP_NAME} Password Reset`;

  const intentLine =
    purpose === "email_verify"
      ? "To complete your verification, please use the following OTP:"
      : "To reset your password, please use the following OTP:";

  const safeOtp = escapeHtml(otp);
  const otpBlocks = safeOtp
    .split("")
    .map(
      (digit) =>
        `<span style="display:inline-block;border:1px solid #10b981;border-radius:6px;padding:8px 10px;margin-right:6px;font-size:22px;font-weight:800;line-height:1;color:#111827;min-width:18px;text-align:center;">${digit}</span>`,
    )
    .join("");

  const html = renderBaseTemplate({
    title: subject,
    heading: subject,
    preheader: "Your one-time code from Huce Autos.",
    greetingName: firstName,
    bodyHtml: `
      <p class="p">${intentLine}</p>
      <p style="margin:12px 0 18px;">${otpBlocks}</p>
      <p class="p">This code is valid for the next 10 minutes.<br/>If you didn’t request this code, please ignore this email.</p>
      <p class="p" style="margin-top:18px;">Thanks,<br/>The ${escapeHtml(APP_NAME)} Team</p>
    `,
  });

  await sendEmail({
    to: email,
    subject,
    html,
    text: `${intentLine} ${otp}. This code is valid for 10 minutes.`,
    metadata: { template: "otp", purpose, otp },
  });
}

export async function sendPurchaseConfirmedEmail(params: {
  email: string;
  firstName: string;
  carName: string;
  price: number;
  sellerName: string;
  purchaseId: number;
}) {
  const appUrl = frontendBaseUrl();
  const html = renderBaseTemplate({
    title: `Your Purchase on ${APP_NAME} is Confirmed`,
    heading: `Your Purchase on ${APP_NAME} is Confirmed!`,
    preheader: "Your purchase payment was successful and is secured in escrow.",
    greetingName: params.firstName,
    bodyHtml: `
      <p class="p">Congratulations on your recent purchase! Here are the details:</p>
      <ul>
        <li>Car Name: ${escapeHtml(params.carName)}</li>
        <li>Price: ${escapeHtml(formatMoney(params.price))}</li>
        <li>Seller: ${escapeHtml(params.sellerName)}</li>
      </ul>
      <p class="p">The payment has been secured in escrow.</p>
      <p class="p" style="margin-top:18px;">Thanks for joining us,<br/>The ${escapeHtml(APP_NAME)} Team</p>
    `,
    ctaLabel: "View Purchase Details",
    ctaUrl: `${appUrl}/dashboard/activity/offer/${params.purchaseId}`,
  });

  await sendEmail({
    to: params.email,
    subject: `Your Purchase on ${APP_NAME} is Confirmed`,
    html,
    metadata: { template: "purchase_confirmed", purchaseId: params.purchaseId },
  });
}

export async function sendListingPublishedEmail(params: {
  email: string;
  firstName: string;
  carName: string;
  price: number;
  listingId: number;
}) {
  const appUrl = frontendBaseUrl();
  const html = renderBaseTemplate({
    title: `Your Listing is Live on ${APP_NAME}`,
    heading: `Your Listing is Live on ${APP_NAME}!`,
    preheader: "Your listing is now visible to potential buyers.",
    greetingName: params.firstName,
    bodyHtml: `
      <p class="p">Your car listing is now live on ${escapeHtml(APP_NAME)} and visible to thousands of potential buyers.</p>
      <p class="p" style="margin-bottom:0;">Listing Details:</p>
      <ul>
        <li>Car Name: ${escapeHtml(params.carName)}</li>
        <li>Price: ${escapeHtml(formatMoney(params.price))}</li>
      </ul>
      <p class="p">Keep an eye on your dashboard for inquiries and offers from interested buyers.</p>
      <p class="p" style="margin-top:18px;">Good luck with your sale,<br/>The ${escapeHtml(APP_NAME)} Team</p>
    `,
    ctaLabel: "View My Listings",
    ctaUrl: `${appUrl}/seller/listings/${params.listingId}`,
  });

  await sendEmail({
    to: params.email,
    subject: `Your Listing is Live on ${APP_NAME}`,
    html,
    metadata: { template: "listing_published", listingId: params.listingId },
  });
}

export async function sendDepositSuccessfulEmail(params: {
  email: string;
  firstName: string;
  amount: number;
  paidAt: Date;
}) {
  const appUrl = frontendBaseUrl();
  const paidAtText = new Intl.DateTimeFormat("en-NG", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(params.paidAt);

  const html = renderBaseTemplate({
    title: "Your Deposit Successful",
    heading: "Your Deposit Successful",
    preheader: "Your wallet deposit has been completed successfully.",
    greetingName: params.firstName,
    bodyHtml: `
      <p class="p">You have successfully deposited <strong style="color:#046c4e;">${escapeHtml(formatMoney(params.amount))}</strong> into your ${escapeHtml(APP_NAME)} wallet.</p>
      <p class="p">at ${escapeHtml(paidAtText)}</p>
      <p class="p" style="margin-top:18px;">Best,<br/>The ${escapeHtml(APP_NAME)} Team</p>
    `,
    ctaLabel: "Go to Wallet",
    ctaUrl: `${appUrl}/dashboard/wallet`,
  });

  await sendEmail({
    to: params.email,
    subject: "Deposit Successful",
    html,
    metadata: { template: "deposit_successful" },
  });
}

export async function sendInspectionAssignedEmail(params: {
  email: string;
  firstName: string;
  inspectionId: number;
  carName: string;
  scheduledAt?: Date | null;
  location?: string | null;
}) {
  const appUrl = frontendBaseUrl();
  const when = params.scheduledAt
    ? new Intl.DateTimeFormat("en-NG", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(params.scheduledAt)
    : "TBD";

  const html = renderBaseTemplate({
    title: "New Inspection Task Assigned",
    heading: "New Inspection Task Assigned",
    preheader: "You have been assigned a new inspection.",
    greetingName: params.firstName,
    bodyHtml: `
      <p class="p">A new inspection task has been assigned to you.</p>
      <ul>
        <li>Inspection ID: #${params.inspectionId}</li>
        <li>Vehicle: ${escapeHtml(params.carName)}</li>
        <li>Scheduled: ${escapeHtml(when)}</li>
        <li>Location: ${escapeHtml(params.location || "Not specified")}</li>
      </ul>
      <p class="p">Please review and proceed with the inspection on time.</p>
    `,
    ctaLabel: "Open Inspector Dashboard",
    ctaUrl: `${appUrl}/inspector/dashboard`,
  });

  await sendEmail({
    to: params.email,
    subject: "New Inspection Task Assigned",
    html,
    metadata: { template: "inspection_assigned", inspectionId: params.inspectionId },
  });
}

export async function sendInspectionRequestedAdminEmail(params: {
  email: string;
  firstName: string;
  inspectionId: number;
  buyerName: string;
  carName: string;
  scheduledAt?: Date | null;
  location?: string | null;
}) {
  const appUrl = frontendBaseUrl();
  const when = params.scheduledAt
    ? new Intl.DateTimeFormat("en-NG", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(params.scheduledAt)
    : "TBD";

  const html = renderBaseTemplate({
    title: "New Inspection Request",
    heading: "New Inspection Request",
    preheader: "A buyer has requested a new vehicle inspection.",
    greetingName: params.firstName,
    bodyHtml: `
      <p class="p">A new inspection request was made by a buyer.</p>
      <ul>
        <li>Inspection ID: #${params.inspectionId}</li>
        <li>Buyer: ${escapeHtml(params.buyerName)}</li>
        <li>Vehicle: ${escapeHtml(params.carName)}</li>
        <li>Scheduled: ${escapeHtml(when)}</li>
        <li>Location: ${escapeHtml(params.location || "Not specified")}</li>
      </ul>
      <p class="p">Assign an inspector to keep operations moving.</p>
    `,
    ctaLabel: "Open Admin Inventory",
    ctaUrl: `${appUrl}/admin/inventory`,
  });

  await sendEmail({
    to: params.email,
    subject: "New Inspection Request",
    html,
    metadata: { template: "inspection_requested_admin", inspectionId: params.inspectionId },
  });
}

export async function sendInspectionCompletedBuyerEmail(params: {
  email: string;
  firstName: string;
  inspectionId: number;
  carName: string;
}) {
  const appUrl = frontendBaseUrl();
  const html = renderBaseTemplate({
    title: "Inspection Completed",
    heading: "Your Inspection Report Is Ready",
    preheader: "The inspector has completed your vehicle inspection.",
    greetingName: params.firstName,
    bodyHtml: `
      <p class="p">Your inspection has been completed and the report is now available.</p>
      <ul>
        <li>Inspection ID: #${params.inspectionId}</li>
        <li>Vehicle: ${escapeHtml(params.carName)}</li>
      </ul>
      <p class="p">Review the report details and proceed with your next decision.</p>
    `,
    ctaLabel: "View Inspection Report",
    ctaUrl: `${appUrl}/dashboard/activity/inspection/${params.inspectionId}`,
  });

  await sendEmail({
    to: params.email,
    subject: "Inspection Completed",
    html,
    metadata: { template: "inspection_completed_buyer", inspectionId: params.inspectionId },
  });
}

export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
