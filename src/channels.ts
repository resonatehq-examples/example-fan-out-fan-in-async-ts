import type { Context } from "@resonatehq/sdk/async";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrderEvent {
  orderId: string;
  userId: string;
  event: string;
  message: string;
}

export interface ChannelResult {
  channel: string;
  success: boolean;
  messageId: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Track push notification attempts (crash demo only)
const pushAttempts = new Map<string, number>();

// ---------------------------------------------------------------------------
// Notification channels — each is an independent async function.
// The engine injects a fresh child Context; steps don't need to forward it.
// ---------------------------------------------------------------------------

export async function sendEmail(
  _ctx: Context,
  event: OrderEvent,
): Promise<ChannelResult> {
  const start = Date.now();
  console.log(`  [email]   Sending confirmation to ${event.userId}...`);
  await sleep(400); // SMTP latency
  const messageId = `msg_email_${Math.random().toString(36).slice(2, 8)}`;
  console.log(`  [email]   Sent — ${messageId}`);
  return { channel: "email", success: true, messageId, durationMs: Date.now() - start };
}

export async function sendSms(
  _ctx: Context,
  event: OrderEvent,
): Promise<ChannelResult> {
  const start = Date.now();
  console.log(`  [sms]     Sending SMS to ${event.userId}...`);
  await sleep(250);
  const messageId = `msg_sms_${Math.random().toString(36).slice(2, 8)}`;
  console.log(`  [sms]     Sent — ${messageId}`);
  return { channel: "sms", success: true, messageId, durationMs: Date.now() - start };
}

export async function sendSlack(
  _ctx: Context,
  event: OrderEvent,
): Promise<ChannelResult> {
  const start = Date.now();
  console.log(`  [slack]   Posting to #orders...`);
  await sleep(180);
  const messageId = `msg_slack_${Math.random().toString(36).slice(2, 8)}`;
  console.log(`  [slack]   Posted — ${messageId}`);
  return { channel: "slack", success: true, messageId, durationMs: Date.now() - start };
}

export async function sendPush(
  _ctx: Context,
  event: OrderEvent,
  simulateCrash: boolean,
): Promise<ChannelResult> {
  const start = Date.now();
  const attempt = (pushAttempts.get(event.orderId) ?? 0) + 1;
  pushAttempts.set(event.orderId, attempt);

  console.log(
    `  [push]    Sending push to ${event.userId} (attempt ${attempt})...`,
  );
  await sleep(120);

  if (simulateCrash && attempt === 1) {
    // Simulates a transient push-service outage.
    // ctx.options({ retryPolicy: new Exponential() }) in the caller retries this.
    throw new Error("Push service temporarily unavailable");
  }

  const messageId = `msg_push_${Math.random().toString(36).slice(2, 8)}`;
  console.log(`  [push]    Delivered — ${messageId}`);
  return { channel: "push", success: true, messageId, durationMs: Date.now() - start };
}
