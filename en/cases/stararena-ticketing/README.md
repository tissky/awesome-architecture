# Case 01 · StarArena: a 20,000-seat concert ticketing system

> The thesis in one line: **this case drills "money-and-inventory correctness under massive request pressure" — when 1 million people fight for 20,000 tickets, the core architectural problem is not simply surviving traffic, but not overselling, not charging incorrectly, and being able to recover when things go wrong.**

---

> **🧪 Case track, case 1 · This case drills one thing**
>
> Drill architectural judgment for **limited inventory + payment flows**: when a monolith is enough, when you must add admission control, when inventory can no longer be protected by a single SQL update, and how the system repairs state when payment succeeds but ticket issuance fails.
>
> | After reading you should be able to | How this case trains it |
> |---|---|
> | Explain why a ticket-rush system cannot let everyone hit the order endpoint | Run one entrance calculation: 1 million users fighting for 20,000 tickets |
> | Explain the trade-off between locking, decrementing, and paying | Compare "decrement after payment," "decrement at order time," and "temporary hold" |
> | Put payment failure, lost callbacks, and ticket-issue failure into the architecture | Use state machines + idempotency + reconciliation / compensation |
> | See why this is not a rewrite of the ticketing template | Expand only the ticket-rush main path and link general abilities back to templates |
>
> **Important reminder: this is a teaching case, not any company's internal blueprint.** The numbers are for order-of-magnitude reasoning. The goal is judgment, not cloning a real platform.

---

## Opening: why ticket rush is not ordinary ordering

Because it is concrete enough to understand, and dangerous enough to teach real architecture.

> **StarArena** is a concert ticketing platform. Tonight at 20:00, a popular concert goes on sale: 20,000 seats in the venue, 1 million users registered for reminders. Users want to arrive on time, choose a section, place an order, pay, and receive tickets. The organizer wants the show sold out quickly. The platform fears three things most: **overselling, charging users without tickets, and the whole site going down.**

If this were an ordinary product, stock could be replenished. Concert seats are **naturally limited inventory**. Twenty thousand seats means twenty thousand seats; selling one extra ticket is an incident.

If this were an ordinary browsing peak, a slow page might be tolerable. Ticket rush traffic is a **sharp spike**. Many users click the same button in the same second, competing for the same sections and seats.

So this chapter is not about "what modules a ticketing system has." It asks a sharper question:

> **How do you safely sell limited inventory in a very short time, while eventually aligning seats, orders, payments, and issued tickets?**

---

## Mini glossary before reading

This chapter repeats a few terms. Here they are in plain language:

| Term | Plain-language meaning |
|---|---|
| QPS / req/s | How many requests arrive per second. 60,000 req/s means 60,000 requests every second. |
| P99 | 99% of requests finish within this time. P99 < 800ms means at least 99 out of 100 requests return within 0.8 seconds. |
| CDN | A static-content cache close to users. Images, JS, and event pages should be served by the CDN when possible, not all by your own servers. |
| Monolith | One application contains most features, such as events, seats, orders, and payment callbacks in one deployable unit. |
| Virtual waiting room | A queueing system. Hold people outside, then admit them in batches at a rate the system can actually handle. |
| Token | A one-time pass. Only users with a token can enter the ticket selection / seat-locking flow. |
| Seat lock | Temporarily hold a seat. If the user pays on time, issue the ticket; if not, release it. |
| State machine | Explicitly defines which states an order can move through, such as `pending payment → paid → ticket issued`. |
| Callback | Another system notifies you later. For example, a payment provider tells you the user has paid. |
| Idempotency | Repeating the same request still has the effect only once. Payment callbacks often repeat, so they must be idempotent. |
| Reconciliation / compensation | Later compare orders, payments, and issued tickets; if something is stuck or inconsistent, run another action to repair it. |
| Rate limiting | Control entry speed. If the system can process 3,000 requests at once, do not admit 60,000. |
| Race condition | Two actions happen around the same time and their order is unstable, such as a payment callback colliding with timeout release. |

---

## 1. Starting point: the monolith was not wrong for small events

StarArena's first version was not built for top-tier concerts. Early on, it sold small livehouse shows, plays, and comedy events.

Its constraints looked roughly like this:

| Dimension | Starting phase |
|---|---|
| Seats per event | 300-3,000 |
| Concurrent users at sale open | 1,000-5,000 |
| Peak order requests | 50-200 QPS |
| Team size | 5-8 people |
| Core goal | Ship quickly, avoid unnecessary infrastructure |
| Acceptable experience | Popular events may be slow sometimes, but tickets must not be sold incorrectly |

At this stage, a normal web monolith is perfectly reasonable:

```
User
 │
 ▼
Web / App
 │
 ▼
┌────────────────────────────────────┐
│  Ticketing monolith                 │
│  ┌────────┐ ┌────────┐ ┌────────┐ │
│  │ Events │ │ Orders │ │ Payment │ │
│  │ Seats  │ │        │ │ callback│ │
│  └────────┘ └────────┘ └────────┘ │
└────────────────────────────────────┘
 │
 ▼
┌────────────────┐
│ Relational DB   │
│ seats / orders  │
└────────────────┘
 │
 ▼
Third-party payment provider
```

Its benefits are practical:

- **Simple transactions**: seat locking and order creation can stay close to one database.
- **Fast development**: one team, one codebase, one deployable unit, low coordination cost.
- **Easy diagnosis**: under low traffic, slow queries and failed orders can still be handled manually.

So do not start by saying "monoliths don't work." Under the old constraints, it was the right answer. The real problem is: **the constraints changed.**

---

## 2. Quantified assumptions: first calculate how sharp the spike is

When a popular concert goes on sale, run a quick estimate first.

```
Venue seats: 20,000
Registered users: 1,000,000
Users who click in the first 10 seconds: 300,000
Average retries per user: 2

Entrance ticket-rush requests ≈ 300,000 × 2 ÷ 10 seconds = 60,000 req/s
Users who can actually succeed ≤ 20,000
Users who must fail or wait ≥ 980,000
```

This number changes the problem. The platform is not trying to "successfully process all 60,000 req/s" — there are not enough tickets. The real issue is:

> **Most requests are doomed not to buy a ticket, so they must not all enter the most expensive and fragile core path.**

Now look at the core-path budget:

| Path | Target |
|---|---|
| Static event page | CDN handles it; do not enter the core system |
| Waiting room queue | Waiting is acceptable; losing eligibility is not |
| Ticket selection / seat locking | P99 < 800ms, failures must be explicit |
| Payment redirect | Can rely on a third party, but state must be recoverable |
| Payment callback to ticket issue | Eventual consistency; do not bet everything on one synchronous call |

This immediately sets the architectural center of gravity: **block traffic first, then talk about ordering; control eligibility first, then talk about inventory; guarantee recovery first, then talk about smooth experience.**

---

## 3. Trigger signals: where the first cracks appear

When the small-event monolith meets a top concert, these signals show up quickly:

| Signal | What it looks like | Why this is architectural |
|---|---|---|
| Entrance spike too sharp | 60,000 req/s hits the ticket-rush endpoint in the first 10 seconds | This is not solved by ordinary scaling; most requests should not enter the core path at all |
| Popular sections become hot spots | The same section / seat area is fought over repeatedly | Inventory updates concentrate on a small number of records or shards |
| Database lock waits explode | Order P99 goes from hundreds of ms to seconds or timeouts | Seat locking and order creation are too tightly coupled; hot-row contention drags down the path |
| Payment callback arrives out of order or is lost | User paid, order still says pending payment | A third-party payment provider is external; synchronous callback success cannot be assumed |
| Manual failure handling explodes | Support staff manually check payment, seat, and ticket records | The system lacks a recoverable state machine and reconciliation ability |

These signals are not merely saying "the system is slow." They are saying: **critical state is starting to drift.**

In ticket rush, the most dangerous failure is not slowness. It is being slow and wrong about seats or money.

---

## 4. Core tension: do not let "rush" directly become "purchase"

The sale-open button hides three very different actions:

1. **Compete for eligibility**: is this user allowed into the purchase flow?
2. **Hold inventory**: can this seat or section be temporarily reserved?
3. **Take money and issue ticket**: once money arrives, can order and ticket eventually align?

The early monolith blended all three:

```
User clicks "buy"
  └─▶ check inventory
      └─▶ create order
          └─▶ redirect to payment
              └─▶ issue ticket after payment callback
```

At small scale, that is fine. Under a spike, two facts tear this path apart:

- **Eligibility competition is massive**, but very few users should enter seat locking.
- **Payment is a slow external dependency**, so seats cannot be tied to payment forever.

The new architectural statement becomes:

> **Split "compete for eligibility," "hold inventory," and "take money / issue ticket" into three controllable stages. Each stage can then rate-limit, time out, retry, and compensate.**

---

## 5. Solution reasoning: when should a ticket be decremented?

This is the most important decision in the case. It looks like an inventory timing choice, but it determines the whole order-payment-ticket structure.

### Option A: decrement after payment succeeds

```
Order → Pay → Decrement ticket → Issue ticket
```

| Benefit | Cost |
|---|---|
| No inventory is held before payment; simple to implement | User may pay successfully but find no ticket left |
| High seat utilization | Post-payment failure is extremely expensive: refunds and support load |

This works for ordinary products with enough stock. It is a poor fit for a hot concert, because "paid but no ticket" is a serious incident.

### Option B: decrement at order time

```
Order succeeds = ticket is officially decremented → wait for payment
```

| Benefit | Cost |
|---|---|
| Harder to oversell | Many unpaid users can hold tickets for a long time |
| Easy to reason about | Scalpers can maliciously occupy seats; utilization drops |

This is safer than A, but too rigid. Users abandon payment, payment fails, networks break. If inventory is permanently decremented at order time, good seats get trapped behind unpaid orders.

### Option C: temporary seat hold + timeout release

```
Admitted → temporary hold (15 min) → pending-payment order → paid → ticket issued
                                      └─ not paid in time → release seat
```

| Benefit | Cost |
|---|---|
| Prevents overselling and avoids permanent unpaid holds | State machine is more complex: timeout, callback, compensation |
| Clear user experience: "seat held, please pay within 15 minutes" | Needs timed release, reconciliation, idempotent callbacks |

StarArena chooses option C.

It is not the simplest option, but it matches the constraints: **tickets must not oversell, payment may fail, and users must not hold seats forever.**

---

## 6. Key architecture decisions: record the "why" with ADRs

ADR means Architecture Decision Record. It does not document every implementation detail; it records **why this choice was made, what was given up, and when it should be revisited.**

### ADR-01: introduce a virtual waiting room to protect the core ticket-rush path

- **Context**: entrance traffic is estimated at ~60,000 req/s in the first 10 seconds, while the stable seat-locking path can only handle a few thousand req/s. Most users are guaranteed not to get tickets.
- **Decision**: every user enters the virtual waiting room first; the waiting room admits users in batches with tokens into ticket selection / seat locking.
- **Gave up**: the experience where everyone immediately reaches the purchase page.
- **Gained**: core capacity becomes controllable; users wait gracefully instead of knocking over database and order paths.
- **Risk**: token anti-abuse, queue fairness, and refresh-without-losing-eligibility must be designed.
- **Revisit when**: event scale drops below core capacity, or core capacity improves by an order of magnitude.

### ADR-02: use temporary seat holds instead of decrementing after payment

- **Context**: inventory is scarce. If payment succeeds but no ticket is available, refunds, complaints, and trust damage follow.
- **Decision**: after admission, temporarily hold the seat or section inventory, create a pending-payment order, confirm the ticket after payment succeeds, and auto-release if payment times out.
- **Gave up**: the simplicity of one-step ordering; we introduce an order state machine and timeout jobs.
- **Gained**: no overselling, and unpaid orders cannot occupy inventory forever.
- **Risk**: timeout release can race with payment callbacks, so idempotency and conditional state updates are required.
- **Revisit when**: the business changes from specific seats to replenishable virtual tickets.

### ADR-03: payment and ticket issue are eventually consistent, with reconciliation and compensation

- **Context**: third-party payment callbacks may be delayed, repeated, or lost; ticket issuing can also fail temporarily. One synchronous call cannot cover every failure.
- **Decision**: payment callbacks idempotently advance order state; background jobs actively query payment status; reconciliation compares orders, payments, and issued tickets, then compensates stuck states.
- **Gave up**: the simple mental model of "one synchronous call finishes everything."
- **Gained**: paid-but-not-issued and lost-callback cases can be detected and repaired by the system.
- **Risk**: users may temporarily see "pending ticket issue," so product copy and support tooling must match.
- **Revisit when**: even if the payment provider offers stronger guarantees, reconciliation should be reduced in frequency, not removed.

---

## 7. Structure and data flow after evolution

Only the ticket-rush main path is drawn below. Generic account, event management, marketing, support, and notification capabilities are intentionally omitted.

### Old path

```
User
 │
 ▼
Ticketing monolith
 │
 ├─▶ check seat / decrement inventory
 ├─▶ create order
 └─▶ redirect to payment
        │
        ▼
     payment callback
        │
        ▼
     update order / issue ticket
```

Problem: the entrance flood, inventory hot spots, and payment uncertainty are all squeezed into one synchronous path.

### New path

```
User
 │
 ▼
┌──────────────┐
│ CDN / event page │  ← static content avoids the core system
└──────┬───────┘
       │ click buy
       ▼
┌──────────────┐
│ Virtual waiting room │  ← queue, issue tokens, control admission rate
└──────┬───────┘
       │ admission token
       ▼
┌──────────────┐
│ Ticket / seat-lock entry │  ← validate token, rate-limit, anti-bot
└──────┬───────┘
       │
       ▼
┌──────────────┐      ┌──────────────┐
│ Seat / inventory svc │────▶│ Order state machine │
│ hold/release/confirm │      │ pending / paid      │
└──────┬───────┘      └──────┬───────┘
       │                     │
       │                     ▼
       │              ┌──────────────┐
       │              │ Payment provider │
       │              └──────┬───────┘
       │                     │ callback / active query
       ▼                     ▼
┌──────────────┐      ┌──────────────┐
│ Timeout release job │      │ Ticket issue service │
└──────────────┘      └──────┬───────┘
                              │
                              ▼
                       ┌──────────────┐
                       │ Reconcile / compensate │
                       └──────────────┘
```

The core change is not "more boxes." The boundaries are clearer:

- **Waiting room** keeps most invalid flood traffic outside.
- **Inventory service** owns only holding, releasing, and confirming seats.
- **Order state machine** admits payment and ticketing will not always finish in one shot.
- **Reconciliation / compensation** pushes stuck states back into shape.

### Follow one successful ticket-rush request end to end

```
1. User opens the event page; static assets return from the CDN.
2. At 20:00, user clicks buy; request enters the virtual waiting room.
3. Waiting room issues a one-time admission token based on system capacity.
4. User carries the token into ticket selection / seat locking.
5. System validates token, user eligibility, and anti-bot rules.
6. Inventory service tries to hold a seat or section inventory, with a 15-minute expiration.
7. Hold succeeds; order state machine creates a pending-payment order.
8. User redirects to third-party payment.
9. Payment success callback arrives; order advances idempotently to paid.
10. Temporary hold becomes confirmed; ticket issue service creates the electronic ticket.
11. Reconciliation later checks that order, payment, and issued ticket agree.
```

Key points:

- The admission token is **admission control**, not an order.
- The seat hold is **temporary**, not final ticket issue.
- The payment callback must be **idempotent**, because providers may notify more than once.
- Ticket issue failure must not disappear; the order should enter `pending issue / compensating`, not pretend success.

### Now follow the timeout path

```
1. User successfully holds a seat; order becomes pending payment.
2. No payment success event arrives within 15 minutes.
3. Timeout job tries to release the seat.
4. Order moves from pending payment to closed.
5. Seat returns to the available pool or next release batch.
```

There is a race here: the user may pay at 14:59, but the callback arrives at 15:02. The fix is not guessing by time; it is conditional state transitions:

```
Only if the order is still "pending payment" may timeout close it.
Only if the order is still "pending payment / payment-confirming" may callback advance it to paid.
Every transition carries a version or state condition.
```

---

## 8. What if it breaks: failure scenarios and fallbacks

| Failure | Direct result | Detection | Architectural fallback |
|---|---|---|---|
| Waiting room issues tokens too fast | Seat-locking path gets crushed | Seat-lock P99, error rate, token consumption speed | Dynamically reduce admission rate; show queue status |
| User holds seat but does not pay | Good seats are occupied | Pending-payment timeout scan | Release seat after 15 minutes |
| Payment succeeds but callback is lost | User paid; order still pending | Active payment query, reconciliation | Idempotently advance order state and continue issuing |
| Payment callback repeats | Order may advance twice | Callback idempotency key, unique payment record | Return success if already processed |
| Ticket issue service is temporarily down | User paid but has no ticket | Paid-but-not-issued order scan | Enter pending issue; issue after recovery |
| Inventory release collides with payment callback | Paid order may be closed by mistake | State-version conflicts, abnormal-state alerts | Conditional updates + reconciliation repair |

The maturity of a ticket-rush system is not measured only by the happy path. It is measured by whether these bad states can be detected, advanced, and repaired by the system itself.

---

## 📌 Validate your reasoning against the templates

This case is not a rewrite of the ticketing template. It takes the most dangerous path in the template and reasons through it with numbers.

| Reusable template | What this case reuses | What this case adds |
|---|---|---|
| [Online Ticketing / Ticket Rush](../../templates/online-ticketing/README.md) | Virtual waiting room, seat hold, timeout release, no overselling | Uses concrete numbers to explain why traffic must be held back and why holding beats direct decrement |
| [E-commerce Platform](../../templates/ecommerce-platform/README.md) | Product / order / inventory / payment boundaries | Compresses ordinary ordering into the extreme "limited inventory at sale open" case |
| [Payment System](../../templates/payment-system/README.md) | Idempotency, state machine, reconciliation, compensation | Shows how the ticketing side recovers when payment succeeds but ticket issue fails |
| [Notification System](../../templates/notification-system/README.md) | Ticket notifications, retries, rate limits | Not expanded here; treated as an async ability after ticket issue |

> **Reading suggestion**: read this chapter first, then return to the [Online Ticketing / Ticket Rush template](../../templates/online-ticketing/README.md). The template's "virtual waiting room" should now read as the soul component, not a decorative queue page.

---

## 🎯 Quick check

<Quiz
  question="When a popular concert goes on sale, why shouldn't every ticket-rush request enter the seat-locking / ordering path directly?"
  :options="['Because the frontend page will be slow, so the frontend framework should be replaced', 'Because most requests are guaranteed not to get a ticket, and admitting them all only crushes inventory, orders, and the database', 'Because payment providers cannot handle high concurrency, so online payment should be removed']"
  :answer="1"
  explanation="The first job in ticket rush is not to process every request. It is to keep the invalid flood outside the core path. With only 20,000 tickets and 1 million users, most people cannot buy; letting everyone hit seat locking / ordering just creates a meltdown."
/>

<Quiz
  question="Why does this chapter choose 'temporary seat hold + timeout release' instead of decrementing after payment succeeds?"
  :options="['Because seat holding is the simplest implementation with the least code', 'Because decrementing after payment can create paid-but-no-ticket, while holding protects scarce inventory first and timeout release prevents indefinite occupation', 'Because this completely removes the need for reconciliation and compensation']"
  :answer="1"
  explanation="Paid-but-no-ticket is a severe incident in ticket rush. Temporary holding costs more state-machine, timeout, and reconciliation complexity, but it buys no overselling and no permanent unpaid holds."
/>

---

## Case summary

- **The old architecture was not wrong; the constraints changed.** A monolith is reasonable for small events. Top-tier sale-open traffic and limited inventory push it to the edge.
- **Run the entrance numbers before drawing the diagram.** 1 million registered users, 300,000 clicks in 10 seconds, and 2 retries per user push entrance traffic toward ~60,000 req/s, forcing the virtual waiting room.
- **Ticket rush splits into three stages:** compete for eligibility, hold inventory, take money / issue tickets. Once separated, each stage can rate-limit, time out, retry, and compensate.
- **Temporary seat hold trades complexity for correctness.** It is more complex than decrementing after payment, but avoids "paid with no ticket" and prevents unpaid orders from holding seats forever.
- **Payment success is not the end; it is the beginning of state advancement.** Callbacks can be late, repeated, or lost. Without idempotency, state machines, and reconciliation, humans eventually become the recovery system.

> **Bridge forward**: this chapter walked through the main path of the [Online Ticketing / Ticket Rush template](../../templates/online-ticketing/README.md). The next case can use the same method on a different concrete product: do not memorize a template; look at old constraints, identify trigger signals, and watch the architecture get forced into shape.

---

## Related links

- Template cross-check: [Online Ticketing / Ticket Rush](../../templates/online-ticketing/README.md) · [E-commerce Platform](../../templates/ecommerce-platform/README.md) · [Payment System](../../templates/payment-system/README.md) · [Notification System](../../templates/notification-system/README.md)
- Methodology: [02 · The architect's thinking framework](../../tutorial/02-架构师的思考框架.md) · [07 · Designing from 0 to 1](../../tutorial/07-从0到1设计一个系统.md) · [08 · ADRs & evolution](../../tutorial/08-架构决策记录与演进.md)
- Hard parts: [11 · The engineering of data consistency](../../tutorial/11-数据一致性工程.md) · [12 · Designing for failure](../../tutorial/12-为失败而设计.md) · [13 · The mechanics of scale](../../tutorial/13-规模化的力学.md) · [14 · Evolving & splitting large systems](../../tutorial/14-演进与拆分大型系统.md)
