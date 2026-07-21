import type { Context } from "@resonatehq/sdk/async";
import { Exponential } from "@resonatehq/sdk";
import {
  sendEmail,
  sendSms,
  sendSlack,
  sendPush,
  type OrderEvent,
  type ChannelResult,
} from "./channels.js";

// ---------------------------------------------------------------------------
// Fan-Out / Fan-In Notification Workflow — Async Engine
// ---------------------------------------------------------------------------
//
// When an order is confirmed, notify the customer through all four channels
// simultaneously: email, SMS, Slack, and push notification.
//
// ctx.run() in the async engine is EAGER — it returns a DurablePromise<T>
// immediately, and the child step begins executing right away. Holding four
// DurablePromises and awaiting them with Promise.all is the async engine's
// native fan-out pattern — no `yield*`, no special parallel mode.
//
// IMPORTANT: the async engine defaults to Never retry (no automatic retry on
// failure). Opt in per step with ctx.options({ retryPolicy: new Exponential() }).
// Contrast with the generator engine: ctx.beginRun() with a regular async
// function defaults to Exponential retry; with a generator function it defaults
// to Never. The async engine always starts at Never — opt in per step.
//
// Total wall time ≈ max(channel latencies), not the sum.
// If a channel retries, the others are already checkpointed — they don't re-run.

export interface NotificationSummary {
  orderId: string;
  channelsNotified: number;
  totalMs: number;
  results: ChannelResult[];
}

export async function notifyAll(
  ctx: Context,
  event: OrderEvent,
  failOnce: boolean,
): Promise<NotificationSummary> {
  const start = Date.now();

  // Fan-out: call ctx.run() for each channel without awaiting.
  // All four start immediately — all execute in parallel.
  const emailP = ctx.run(sendEmail, event);
  const smsP   = ctx.run(sendSms, event);
  const slackP = ctx.run(sendSlack, event);

  // Push: in retry mode, opt into Exponential retry to recover from the
  // transient error. Without ctx.options({ retryPolicy }), the default
  // Never policy would propagate the push failure to Promise.all immediately.
  const pushP = failOnce
    ? ctx.run(sendPush, event, failOnce, ctx.options({ retryPolicy: new Exponential() }))
    : ctx.run(sendPush, event, failOnce);

  // Fan-in: native Promise.all — waits for all four DurablePromises to settle.
  // Resonate checkpoints each result independently. On recovery, only the
  // channels that hadn't finished will re-run.
  const results: ChannelResult[] = await Promise.all([
    emailP,
    smsP,
    slackP,
    pushP,
  ]);

  return {
    orderId: event.orderId,
    channelsNotified: results.filter((r) => r.success).length,
    totalMs: Date.now() - start,
    results,
  };
}
