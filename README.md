<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/banner-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./assets/banner-light.png">
    <img alt="Fan-Out / Fan-In — Async Engine — Resonate example" src="./assets/banner-dark.png">
  </picture>
</p>

<p align="center">
  <a href="https://resonatehq.github.io/examples-ci/">
    <img src="https://img.shields.io/endpoint?url=https://resonatehq.github.io/examples-ci/status/example-fan-out-fan-in-async-ts.json" alt="examples-ci status">
  </a>
</p>

# Fan-Out / Fan-In — Async Engine

Parallel notification delivery with crash recovery, using the async/await engine. When an order is confirmed, notify the customer simultaneously through all four channels — email, SMS, Slack, and push notification. Total time equals the slowest channel, not the sum.

## What This Demonstrates

- **Fan-out with `ctx.run()`**: each call is eager — all four channels start immediately, no `await` needed to launch them
- **Fan-in with `Promise.all()`**: native JavaScript promise composition, no special parallel mode
- **Per-step retry opt-in**: the async engine defaults to `Never` retry; `ctx.options({ retryPolicy: new Exponential() })` opts a single step in
- **Checkpoint independence**: if push retries, email/SMS/Slack are already checkpointed and are not re-sent

## The Key Difference from the Generator Engine

The async engine's `ctx.run()` returns a `DurablePromise<T>` immediately — the step starts executing in the background. This makes fan-out natural:

```typescript
// Async engine — fan-out: all four start at the same time
const emailP = ctx.run(sendEmail, event);
const smsP   = ctx.run(sendSms, event);
const slackP = ctx.run(sendSlack, event);
const pushP  = ctx.run(sendPush, event, simulateCrash);

// Fan-in: native Promise.all — waits for all four
const results = await Promise.all([emailP, smsP, slackP, pushP]);
```

Compare to the [generator engine sibling](https://github.com/resonatehq-examples/example-fan-out-fan-in-ts), which uses `yield* ctx.beginRun()` and explicit future handles.

**Retry policy note**: the async engine defaults to `Never` retry — you opt in per step:

```typescript
// Default: Never retry (fails immediately on error)
const smsP = ctx.run(sendSms, event);

// Opt in to Exponential for one step only
const pushP = ctx.run(sendPush, event, simulateCrash, ctx.options({ retryPolicy: new Exponential() }));
```

This is the opposite of the generator engine, which retries with `Exponential` by default.

## Prerequisites

- [Bun](https://bun.sh) v1.0+

No server required. The async engine runs in embedded mode when `RESONATE_URL` is not set.

## Setup

```bash
git clone https://github.com/resonatehq-examples/example-fan-out-fan-in-async-ts
cd example-fan-out-fan-in-async-ts
bun install
```

## Run It

**Happy path** — all 4 channels in parallel:
```bash
bun start
```

```
=== Fan-Out / Fan-In (Async Engine) ===
Mode: HAPPY PATH  (4 channels, Promise.all fan-in)

Order ord_1784568258797 confirmed — notifying user_alice...

  [email]   Sending confirmation to user_alice...
  [sms]     Sending SMS to user_alice...
  [slack]   Posting to #orders...
  [push]    Sending push to user_alice (attempt 1)...
  [push]    Delivered — msg_push_d56drl
  [slack]   Posted — msg_slack_1a4b52
  [sms]     Sent — msg_sms_a8ypzi
  [email]   Sent — msg_email_vvm104

=== Result ===
Channels notified: 4/4
Wall time: 511ms

Channel timings:
  email  401ms  msg_email_vvm104
  sms    250ms  msg_sms_a8ypzi
  slack  180ms  msg_slack_1a4b52
  push   120ms  msg_push_d56drl

Fan-out time:   511ms
Sequential est: 951ms
Speedup:        1.9x
```

**Crash mode** — push service down on attempt 1; opted into `Exponential` retry, so it recovers:
```bash
bun start:crash
```

```
=== Fan-Out / Fan-In (Async Engine) ===
Mode: RETRY DEMO  (push fails on attempt 1 → retries with Exponential)

Order ord_1784568264132 confirmed — notifying user_alice...

  [email]   Sending confirmation to user_alice...
  [sms]     Sending SMS to user_alice...
  [slack]   Posting to #orders...
  [push]    Sending push to user_alice (attempt 1)...
  [slack]   Posted — msg_slack_uidqpq
  [sms]     Sent — msg_sms_z079xv
  [email]   Sent — msg_email_7azmvk
  [push]    Sending push to user_alice (attempt 2)...
  [push]    Delivered — msg_push_wzz0iq

=== Result ===
Channels notified: 4/4
Wall time: 2312ms
```

**With a Resonate server** (optional):
```bash
RESONATE_URL=http://localhost:8001 bun start
```

## What to Observe

1. **Parallel start**: all four `[channel]   Sending...` lines appear before any completion lines — they start concurrently without waiting for each other.
2. **Completion order**: channels finish in latency order (push 120ms, slack 180ms, sms 250ms, email 400ms), not submission order.
3. **Speedup**: ~511ms total vs ~951ms sequential — bounded by the slowest channel, not the sum.
4. **Partial retry**: in crash mode, email/SMS/Slack complete and checkpoint while push is still failing. Push retries on its own. The other three are NOT re-sent.

## The Code

The workflow is in [`src/workflow.ts`](src/workflow.ts):

```typescript
import type { Context } from "@resonatehq/sdk/async";
import { Exponential } from "@resonatehq/sdk";

export async function notifyAll(
  ctx: Context,
  event: OrderEvent,
  simulateCrash: boolean,
): Promise<NotificationSummary> {
  const start = Date.now();

  // Fan-out: ctx.run() is eager — all four start immediately
  const emailP = ctx.run(sendEmail, event);
  const smsP   = ctx.run(sendSms, event);
  const slackP = ctx.run(sendSlack, event);

  // Push: opt into retry only for this step
  const pushP = simulateCrash
    ? ctx.run(sendPush, event, simulateCrash, ctx.options({ retryPolicy: new Exponential() }))
    : ctx.run(sendPush, event, simulateCrash);

  // Fan-in: native Promise.all — DurablePromise<T> implements Promise<T>
  const results = await Promise.all([emailP, smsP, slackP, pushP]);

  return {
    orderId: event.orderId,
    channelsNotified: results.filter((r) => r.success).length,
    totalMs: Date.now() - start,
    results,
  };
}
```

## File Structure

```
example-fan-out-fan-in-async-ts/
├── src/
│   ├── index.ts      Entry point — Resonate setup and demo runner
│   ├── workflow.ts   Fan-out / fan-in workflow using async engine
│   └── channels.ts   Channel functions — email, SMS, Slack, push
├── assets/
│   ├── banner-dark.png
│   └── banner-light.png
├── package.json
└── tsconfig.json
```

## Learn More

- [Resonate documentation](https://docs.resonatehq.io)
- [Generator engine sibling](https://github.com/resonatehq-examples/example-fan-out-fan-in-ts) — same pattern with `function*`/`yield*`/`beginRun`
