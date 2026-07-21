import { Resonate } from "@resonatehq/sdk/async";
import { notifyAll, type NotificationSummary } from "./workflow.js";
import type { OrderEvent } from "./channels.js";

// ---------------------------------------------------------------------------
// Resonate setup — async engine
//
// RESONATE_URL overrides the default embedded (local-store) mode.
// Use `RESONATE_URL=http://localhost:8073 bun start` to connect to a server.
// ---------------------------------------------------------------------------

const url = process.env.RESONATE_URL;
const resonate = url ? new Resonate({ url }) : new Resonate();
resonate.register("notifyAll", notifyAll);

// ---------------------------------------------------------------------------
// Demo runner
// ---------------------------------------------------------------------------

const failOnce = process.argv.includes("--fail-once");

const event: OrderEvent = {
  orderId: `ord_${Date.now()}`,
  userId: "user_alice",
  event: "order.confirmed",
  message: "Your order has been confirmed! Estimated delivery: 2 hours.",
};

console.log("=== Fan-Out / Fan-In (Async Engine) ===");
console.log(
  failOnce
    ? "Mode: RETRY DEMO  (push fails on attempt 1 → retries with Exponential)"
    : "Mode: HAPPY PATH  (4 channels, Promise.all fan-in)",
);
console.log(`\nOrder ${event.orderId} confirmed — notifying ${event.userId}...\n`);

const wallStart = Date.now();

const handle = await resonate.run<NotificationSummary>(
  `notify/${event.orderId}`,
  "notifyAll",
  event,
  failOnce,
);
const result = await handle.result();
const wallMs = Date.now() - wallStart;

console.log("\n=== Result ===");
console.log(`Channels notified: ${result.channelsNotified}/4`);
console.log(`Wall time: ${wallMs}ms`);
console.log(`\nChannel timings:`);
for (const r of result.results) {
  console.log(`  ${r.channel.padEnd(6)} ${r.durationMs}ms  ${r.messageId}`);
}

if (!failOnce) {
  const sequential = result.results.reduce((s, r) => s + r.durationMs, 0);
  console.log(`\nFan-out time:   ${wallMs}ms`);
  console.log(`Sequential est: ${sequential}ms`);
  console.log(`Speedup:        ${(sequential / wallMs).toFixed(1)}x`);
}

if (failOnce) {
  console.log(
    "\nNote: push failed on attempt 1 and was retried via ctx.options({ retryPolicy: new Exponential() }).",
    "\nEmail, SMS, and Slack completed before the retry — they were NOT re-sent.",
    "\nWithout ctx.options({ retryPolicy }), the async engine's default Never policy",
    "\nwould have propagated the push failure to Promise.all immediately.",
  );
}

await resonate.stop();
