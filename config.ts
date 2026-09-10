/**
 * Paystack server-side configuration.
 * Never import secrets into client components.
 * Do not trust browser-reported payment success.
 */

export function getPaystackSecretKey(): string | undefined {
  return process.env.PAYSTACK_SECRET_KEY?.trim() || undefined;
}

export function getPaystackPublicKey(): string | undefined {
  // Public key may be exposed to the browser when checkout is enabled.
  // Prefer dedicated public env if present; never use the secret key.
  return (
    process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY?.trim() ||
    process.env.PAYSTACK_PUBLIC_KEY?.trim() ||
    undefined
  );
}

export function getPaystackWebhookSecret(): string | undefined {
  return process.env.PAYSTACK_WEBHOOK_SECRET?.trim() || undefined;
}

export function isPaystackReady(): boolean {
  return Boolean(getPaystackSecretKey());
}

export function paystackStatusMessage(): string {
  if (!getPaystackSecretKey()) {
    return "Paystack is not configured. Set PAYSTACK_SECRET_KEY on the server before enabling billing.";
  }
  if (!getPaystackWebhookSecret()) {
    return "Paystack secret is set. Add PAYSTACK_WEBHOOK_SECRET before trusting webhooks in production.";
  }
  return "Paystack is configured for server-side verification.";
}
