import { createHmac, timingSafeEqual } from "node:crypto";

// Thin wrapper around the Paystack REST API. Centralised here so request
// handlers stay focused on business logic and we have a single place to
// stub when writing tests.

const PAYSTACK_BASE = "https://api.paystack.co";

function getSecret(): string {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }
  return secret;
}

interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

interface PaystackRequestInit extends RequestInit {
  timeoutMs?: number;
}

async function paystackFetch<T>(
  path: string,
  init?: PaystackRequestInit,
): Promise<T> {
  const timeoutMs = init?.timeoutMs;
  const controller = new AbortController();
  const timer = timeoutMs
    ? setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs)
    : null;

  const cleanInit = { ...(init ?? {}) } as PaystackRequestInit;
  delete cleanInit.timeoutMs;

  let res: Response;
  try {
    res = await fetch(`${PAYSTACK_BASE}${path}`, {
      ...cleanInit,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${getSecret()}`,
        "Content-Type": "application/json",
        ...(cleanInit.headers ?? {}),
      },
    });
  } catch (err) {
    if (timer) clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Paystack ${path} failed: Request timed out`);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }

  let body: PaystackEnvelope<T> | { status: false; message: string };
  try {
    body = (await res.json()) as PaystackEnvelope<T>;
  } catch {
    throw new Error(`Paystack returned ${res.status} with non-JSON body`);
  }

  if (!res.ok || !body.status) {
    throw new Error(
      `Paystack ${path} failed: ${(body as { message?: string }).message ?? res.statusText}`,
    );
  }
  return (body as PaystackEnvelope<T>).data;
}

// ─── Banks ──────────────────────────────────────────────────────────────────

export interface PaystackBank {
  id: number;
  name: string;
  slug: string;
  code: string;
  currency: string;
  type: string;
  active: boolean;
}

export async function listBanks(country = "nigeria"): Promise<PaystackBank[]> {
  return paystackFetch<PaystackBank[]>(
    `/bank?country=${encodeURIComponent(country)}`,
    { method: "GET", timeoutMs: 3500 },
  );
}

// ─── Bank account name resolve ──────────────────────────────────────────────

export interface ResolveAccountResponse {
  account_number: string;
  account_name: string;
  bank_id?: number;
}

export async function resolveAccount(
  accountNumber: string,
  bankCode: string,
): Promise<ResolveAccountResponse> {
  const params = new URLSearchParams({
    account_number: accountNumber,
    bank_code: bankCode,
  });
  return paystackFetch<ResolveAccountResponse>(
    `/bank/resolve?${params.toString()}`,
    { method: "GET" },
  );
}

// ─── Initialize a transaction (returns a Paystack-hosted checkout URL) ──────

export interface InitializeTransactionInput {
  email: string;
  /** Amount in *naira* — converted to kobo before being sent to Paystack. */
  amountNaira: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export interface InitializeTransactionResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export async function initializeTransaction(
  input: InitializeTransactionInput,
): Promise<InitializeTransactionResponse> {
  return paystackFetch<InitializeTransactionResponse>(
    `/transaction/initialize`,
    {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        // Paystack expects the smallest currency unit (kobo for NGN). We
        // multiply at the boundary so the rest of the codebase stays in
        // naira.
        amount: Math.round(input.amountNaira * 100),
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    },
  );
}

// ─── Verify a transaction by its reference ──────────────────────────────────

export interface VerifyTransactionResponse {
  status: "success" | "failed" | "abandoned" | string;
  reference: string;
  amount: number; // kobo
  currency: string;
  channel?: string;
  paid_at?: string | null;
  customer?: { email?: string };
  metadata?: Record<string, unknown> | string | null;
  [key: string]: unknown;
}

export async function verifyTransaction(
  reference: string,
): Promise<VerifyTransactionResponse> {
  return paystackFetch<VerifyTransactionResponse>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
    { method: "GET" },
  );
}

// ─── Transfers (withdrawals) ────────────────────────────────────────────────

export interface CreateTransferRecipientInput {
  name: string;
  accountNumber: string;
  bankCode: string;
  currency?: "NGN";
}

export interface CreateTransferRecipientResponse {
  active: boolean;
  recipient_code: string;
  name: string;
  type: string;
  currency: string;
  details?: Record<string, unknown>;
}

export async function createTransferRecipient(
  input: CreateTransferRecipientInput,
): Promise<CreateTransferRecipientResponse> {
  return paystackFetch<CreateTransferRecipientResponse>(`/transferrecipient`, {
    method: "POST",
    body: JSON.stringify({
      type: "nuban",
      name: input.name,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      currency: input.currency ?? "NGN",
    }),
  });
}

export interface InitiateTransferInput {
  amountNaira: number;
  recipientCode: string;
  reason?: string;
  reference: string;
}

export interface InitiateTransferResponse {
  transfer_code: string;
  reference: string;
  status: "pending" | "success" | "failed" | string;
  amount: number; // kobo
  recipient?: Record<string, unknown>;
}

export async function initiateTransfer(
  input: InitiateTransferInput,
): Promise<InitiateTransferResponse> {
  return paystackFetch<InitiateTransferResponse>(`/transfer`, {
    method: "POST",
    body: JSON.stringify({
      source: "balance",
      amount: Math.round(input.amountNaira * 100),
      recipient: input.recipientCode,
      reason: input.reason,
      reference: input.reference,
    }),
  });
}

// ─── Webhook signature verification ─────────────────────────────────────────
// Paystack signs every webhook with HMAC-SHA512 using your secret key. We
// MUST verify this before trusting anything in the body — otherwise an
// attacker could POST a fake "success" event and credit themselves.

export function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string | undefined,
): boolean {
  if (!signature) return false;
  // Paystack's x-paystack-signature is a hex-encoded SHA-512 HMAC: 128 hex
  // chars → 64 bytes. Reject anything that isn't strictly that shape so
  // Buffer.from(..., "hex") can't silently truncate on bad input.
  if (signature.length !== 128 || !/^[0-9a-f]+$/i.test(signature)) {
    return false;
  }
  const expectedHex = createHmac("sha512", getSecret())
    .update(rawBody)
    .digest("hex");
  const expected = Buffer.from(expectedHex, "hex");
  const provided = Buffer.from(signature, "hex");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export function getPublicKey(): string | undefined {
  return process.env.PAYSTACK_PUBLIC_KEY;
}
