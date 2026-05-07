import test from "node:test";
import assert from "node:assert/strict";

import { sendOtpEmail } from "./email";

test("sendOtpEmail uses Resend provider when configured", async () => {
  const previousEnv = {
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
  };
  const originalFetch = globalThis.fetch;

  process.env.EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.EMAIL_FROM = "Huce Automart <noreply@send.huceautomart.com>";
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;

  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedInit = init;
    return {
      ok: true,
      status: 200,
      text: async () => "",
    } as Response;
  }) as typeof fetch;

  try {
    await sendOtpEmail("buyer@example.com", "123456", "email_verify", "Buyer");

    assert.equal(capturedUrl, "https://api.resend.com/emails");
    assert.equal(capturedInit?.method, "POST");

    const headers = capturedInit?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer re_test_key");
    assert.equal(headers["Content-Type"], "application/json");

    const body = JSON.parse(String(capturedInit?.body ?? "{}")) as {
      from: string;
      to: string[];
      subject: string;
      html: string;
      text?: string;
    };

    assert.equal(body.from, "Huce Automart <noreply@send.huceautomart.com>");
    assert.deepEqual(body.to, ["buyer@example.com"]);
    assert.match(body.subject, /OTP/i);
    assert.match(body.text ?? "", /123456/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnv.EMAIL_PROVIDER === undefined) delete process.env.EMAIL_PROVIDER;
    else process.env.EMAIL_PROVIDER = previousEnv.EMAIL_PROVIDER;
    if (previousEnv.RESEND_API_KEY === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousEnv.RESEND_API_KEY;
    if (previousEnv.EMAIL_FROM === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previousEnv.EMAIL_FROM;
    if (previousEnv.SMTP_HOST === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = previousEnv.SMTP_HOST;
    if (previousEnv.SMTP_USER === undefined) delete process.env.SMTP_USER;
    else process.env.SMTP_USER = previousEnv.SMTP_USER;
    if (previousEnv.SMTP_PASS === undefined) delete process.env.SMTP_PASS;
    else process.env.SMTP_PASS = previousEnv.SMTP_PASS;
  }
});
