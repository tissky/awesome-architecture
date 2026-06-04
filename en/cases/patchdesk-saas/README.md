# Case 02 · PatchDesk: a lightweight ticketing SaaS for 20-person teams

> The thesis in one line: **this case drills restraint and boundaries in ordinary SaaS** — a ticketing system looks like plain CRUD, but the real difficulty is tenant isolation, permission boundaries, search and reporting, notification side effects, and preventing later evolution from rotting the architecture.

---

> **🧪 Case track, case 2 · This case drills one thing**
>
> Drill architectural judgment for a **modular monolith + multi-tenant SaaS**: when not to split into microservices, when tenant isolation must become structural, and when search / reporting / notifications should leave the main request path.
>
> | After reading you should be able to | How this case trains it |
> |---|---|
> | Explain why a 20-person-team SaaS should not start with microservices | Estimate team size, tenant count, QPS, and complexity budget |
> | Explain the trade-off between three multi-tenant isolation models | Compare shared tables, schema per tenant, and database per tenant |
> | Put permissions, timelines, and notifications into the architecture, not patches | Use RBAC, ticket events, Outbox, and async notifications |
> | Recognize when an ordinary CRUD system should evolve | Trigger upgrades with slow search, reporting load, and failed notifications |
>
> **Important reminder: this is a teaching case, not any SaaS product's internal blueprint.** The numbers are for order-of-magnitude reasoning. The goal is judgment, not a single correct answer.

---

## Opening: why an ordinary ticketing system deserves a chapter

Because most teams do not spend their days building ticket-rush systems, payment ledgers, or ride-hailing platforms. They build ordinary SaaS back offices.

> **PatchDesk** is a lightweight ticketing system for teams of 20 people or fewer. Customers submit issues; team members assign owners, comment, change status, send email notifications, and view simple reports.

At first glance, it is ordinary:

- tenant signup;
- member management;
- ticket CRUD;
- comments and attachments;
- email notifications;
- basic search and reports.

But ordinary does not mean architecture-free. The hard part is not "how to write a create-ticket endpoint." The hard part is:

> **When one system serves many companies, how do you make each company see only its own data, let each role do only what it should, and avoid taking on distributed complexity before the pressure justifies it?**

This chapter is the opposite of [StarArena](../stararena-ticketing/README.md): StarArena says "pressure is too high; complexity is forced." PatchDesk says "pressure is not high yet; do not add complexity before the signal."

---

## Mini glossary before reading

This chapter repeats a few terms. Here they are in plain language:

| Term | Plain-language meaning |
|---|---|
| CRUD | Create, Read, Update, Delete. Many back-office systems look like CRUD on the surface. |
| QPS | Queries Per Second: requests per second, used here as a rough pressure estimate. |
| P95 | 95% of requests finish within this time. For example, P95 < 300ms means about 95 out of 100 requests finish under 300 milliseconds. |
| SaaS | Software as a Service: one online product sold to many customers. |
| Tenant | One customer organization in SaaS, such as Company A or Company B. Each tenant should see only its own data. |
| Multi-tenancy | One system serves many tenants at once. The challenge is low cost without data leakage. |
| RBAC | Role-Based Access Control. Permissions are based on roles such as admin, agent, or read-only member. |
| Modular monolith | Still one app deployed together, but internally split by business modules, such as tenant, ticket, notification, and reporting. |
| Audit log | Records who did what and when. It helps with incident investigation and compliance. |
| Read model | A data view prepared for queries / reports, so heavy reads do not hurt the transactional database. |
| Async job | Work users should not wait for, such as email sending or report generation, run in the background. |
| Outbox | A table of events waiting to be delivered. When the business write succeeds, the system also writes notification / indexing events into the database, then background workers deliver them. |
| SLA | Service Level Agreement: a promised service time, such as responding to a priority ticket within two hours. |
| tenant_id | A field that marks which tenant a row belongs to. Forgetting it can leak data across tenants. |

---

## 1. Starting point: get the product right before making the architecture big

PatchDesk version one has a simple goal: **help small teams receive customer issues, assign them, and track them to closure.**

The starting constraints look roughly like this:

| Dimension | Starting phase |
|---|---|
| Tenant count | Fewer than 50 |
| Members per tenant | 5-20 |
| Tickets per tenant per day | 20-200 |
| Peak read requests | 50-150 QPS |
| Peak write requests | 10-30 QPS |
| Team size | 3-6 engineers |
| Core goal | Ship quickly and validate whether anyone wants it |
| Must not fail | Tenant A must not see Tenant B's data; ordinary members must not change global settings |

The right architecture at this point is not microservices. It is a **modular monolith + one relational database + a simple background job queue**:

```
Browser / mobile client
      │
      ▼
┌──────────────────────────────────────────┐
│  PatchDesk monolith                       │
│  ┌────────┐ ┌────────┐ ┌────────┐       │
│  │ Tenant │ │ Ticket │ │ RBAC   │       │
│  │ Member │ │ Comment│ │ Authz  │       │
│  └────────┘ └────────┘ └────────┘       │
│  ┌────────┐ ┌────────┐ ┌────────┐       │
│  │ Notify │ │ Search │ │ Audit  │       │
│  │ Jobs   │ │ Report │ │ Log    │       │
│  └────────┘ └────────┘ └────────┘       │
└───────────────┬──────────────────────────┘
                │
        ┌───────┴────────┐
        ▼                ▼
┌────────────┐     ┌────────────┐
│ Primary DB  │     │ Job queue   │
│ tickets etc │     │ email/report│
└────────────┘     └────────────┘
```

This is not "no architecture." It has already identified the most important boundaries; it simply has not split them into separately deployed services yet.

---

## 2. Quantified assumptions: QPS will not kill it first; boundaries will

Run the numbers. Suppose PatchDesk has been online for half a year. It is no longer a toy, but it is still lightweight SaaS:

```
Tenants: 200
Active tenants: 50
Members per tenant: 5-30
New tickets: 5,000-20,000 per day
Average events per ticket: 6-10 comments / status changes / assignment records
Peak reads: 100-300 QPS
Peak writes: 20-80 QPS
Attachment limit: 25MB each
New attachment volume: around 100GB per month
Notifications per ticket update: 1-5 emails / webhooks / in-app messages
Target: create / update P95 < 300ms, list query P95 < 700ms
Async target: notifications, webhooks, and search indexing usually visible within 30 seconds
```

This is not scary for a normal relational database and modular monolith.

The real dangers are three different things:

1. **Tenant isolation**: if any query forgets `tenant_id`, Company A may see Company B's tickets.
2. **Permission boundaries**: can an ordinary member delete tickets? Can an outsourced member see finance tickets? Can a team lead change global settings?
3. **Slow side effects**: if email sending, report generation, and search indexing block the user request, experience slows down and failures become hard to repair.
4. **Complete history**: storing only the current `tickets.status` is not enough. Who changed the status, who reassigned the owner, and which notification failed must be traceable.

So PatchDesk's architectural center of gravity is not "how to handle 100K QPS." It is:

> **Make tenant, permission, state history, and slow side-effect boundaries structural, instead of relying on every developer to remember them every time.**

---

## 3. Trigger signals: when version one starts to be insufficient

Once version one is running, do not upgrade by feeling. Watch these signals:

| Signal | What it looks like | Why this is architectural |
|---|---|---|
| Tenant-leak risk appears | A list endpoint forgets `tenant_id`; tests catch it | Tenant isolation depends on human discipline, not structural enforcement |
| Permission checks scatter everywhere | Every endpoint has its own `if role == ...` block | Rules duplicate and drift, increasing authorization risk |
| Ticket search slows down | Keyword search drives primary DB CPU high | Search reads conflict with transactional writes; needs an index or read model |
| Reports slow normal requests | Admin monthly export makes ticket lists slow too | Heavy queries compete with online traffic on the same database |
| Notification failure is hard to repair | Ticket creation succeeds, email provider is down, nobody knows the notification failed | Side effects lack Outbox / async jobs and delivery-state tracking |
| Email ingress is delivered twice | One customer email creates two tickets | External input has no idempotency key, so duplicate messages cannot be recognized |
| Audit cannot answer questions | Customer asks "who deleted this ticket?" and the system cannot answer | Audit logging is not a switch you can add afterward; key actions must record it structurally |

These signals are not asking "should we use microservices?" They are saying: **boundaries and side effects are starting to depend on manual discipline.**

---

## 4. Core tension: CRUD is easy; who can see and change what is hard

PatchDesk has only a few core objects:

1. **Tenant / member**: which company, which people.
2. **Ticket / comment / attachment / ticket event**: the issue, handling process, and full timeline.
3. **Permission / audit / notification**: who can do what, what happened, and who should be told.

If you look only at CRUD, it feels simple:

```
User request → read ticket → change status → write comment → send notification
```

A real system must answer at every step:

- Which tenant does this user belong to?
- Is this user allowed to view this ticket?
- Should this change write an audit log?
- Can notification failure be retried?
- Can search / reporting avoid slowing the main path?

The new architectural statement becomes:

> **Move tenant isolation, authorization, and slow side effects out of scattered endpoint code and into fixed system structure.**

One easily underestimated point: a ticketing system should not store only the final state.

If you only have this column:

```
tickets(id, tenant_id, title, status, assignee_id, ...)
```

You know only "what state it is in now." A support system also needs to know "how it got there":

- Who changed the ticket from `open` to `pending`?
- Who reassigned the owner from A to B?
- What new information did the customer add?
- Did the SLA reminder fire?
- Which notifications succeeded, and which failed?

A stronger structure is:

```
tickets(id, tenant_id, status, assignee_id, ...)
ticket_events(id, tenant_id, ticket_id, actor_id, type, payload, created_at)
outbox_events(id, tenant_id, aggregate_type, aggregate_id, event_type, payload, status)
```

`tickets` stores the current state, so lists and detail pages are fast. `ticket_events` stores an append-only timeline, so audit and incident review have evidence. `outbox_events` stores side effects waiting to be delivered, so email, webhooks, and search indexing can be retried after failure.

---

## 5. Solution reasoning: how should tenants be isolated?

This is the most important decision in the case. A SaaS system usually has three choices.

### Option A: shared database and shared tables, each row has `tenant_id`

```
tickets(id, tenant_id, title, status, assignee_id, ...)
comments(id, tenant_id, ticket_id, body, ...)
```

| Benefit | Cost |
|---|---|
| Lowest cost, simplest operations, good for many small customers | Weakest isolation; missing one `tenant_id` can leak data |
| Easy cross-tenant operational analytics | Tenant filtering must be enforced by the platform, not memory |

### Option B: shared database, schema per tenant

```
tenant_a.tickets
tenant_b.tickets
```

| Benefit | Cost |
|---|---|
| Stronger isolation than shared tables; export / migration per tenant is clearer | Many schemas make migrations, operations, and version upgrades harder |
| More reassuring for enterprise customers | Management cost rises when there are many small tenants |

### Option C: database per tenant

```
tenant_a_db
tenant_b_db
```

| Benefit | Cost |
|---|---|
| Strongest isolation, smaller blast radius | Cost and operations grow roughly linearly with tenant count |
| Good for large customers, compliance, and data residency | Too much drag for the MVP phase |

PatchDesk chooses, for phase one: **shared database and shared tables, but tenant isolation must be structurally enforced.**

The key is not merely "use `tenant_id`." The key is:

> **Do not require every developer to remember `tenant_id` every time; make query entry points, ORM / data access, and tests enforce it together.**

If high-value enterprise customers appear later, a few tenants can move to separate schemas or databases. But that should be triggered by customer value, compliance, and risk — not applied to everyone on day one.

---

## 6. Key architecture decisions: record the "why" with ADRs

ADR means Architecture Decision Record. Ordinary SaaS systems are often questioned later: "Why didn't we start with microservices? Why shared tables? Why async search?" Those answers should be recorded before memory fades.

### ADR-01: start with a modular monolith, not microservices

- **Context**: the team has only 3-6 engineers, tenant count and QPS are low, and business boundaries will change during product validation.
- **Decision**: one deployable unit, internally split into tenant, ticket, permission, notification, and reporting modules.
- **Gave up**: independent deployment and independent scaling per service.
- **Gained**: simpler development, debugging, transactions, and releases; the team can focus on product and boundaries.
- **Risk**: if module boundaries are not enforced, the monolith can decay into a big ball of mud.
- **Revisit when**: two or more teams are repeatedly blocked in the same module, or one module truly needs independent scaling / release.

### ADR-02: use shared-table multi-tenancy, but enforce tenant filtering structurally

- **Context**: PatchDesk targets many small teams, so database-per-tenant is too expensive. But cross-tenant leakage is a top-severity incident.
- **Decision**: core tables carry `tenant_id`; all data access goes through tenant context; automated tests verify cross-tenant invisibility.
- **Gave up**: the stronger assurance of physical isolation.
- **Gained**: low cost and low operational complexity for many small tenants.
- **Risk**: if someone bypasses the data access layer and queries directly, isolation can still be missed.
- **Revisit when**: strong compliance customers, data residency requirements, or tenant-leak risk can no longer be controlled at the platform layer.

### ADR-03: write ticket changes through a state machine + timeline, and send side effects through Outbox / queue

- **Context**: ticket status, comments, assignment, SLA, and notifications all revolve around change events; external email and webhooks can fail, duplicate, or lag.
- **Decision**: one ticket change updates current state, appends `ticket_events`, and writes `outbox_events` in the same transaction; background workers send email, webhooks, indexing, and SLA reminders.
- **Gave up**: a full notification platform, search cluster, and data warehouse on day one.
- **Gained**: short main request path, auditable history, retryable side effects, and complexity that grows with signals.
- **Risk**: async work means short delays; users may receive email or see search results a few seconds later.
- **Revisit when**: search P95 stays above target, reports affect the primary DB, or notification failure rate becomes unacceptable.

---

## 7. Structure and data flow after evolution

PatchDesk is still a modular monolith, not a microservice system.

### Starting path

```
User request
  └─▶ ticket endpoint
      └─▶ read / write tickets table
          └─▶ send email synchronously
              └─▶ return result
```

Problem: tenant checks, permission checks, and notification side effects are all squeezed into endpoint code and become more scattered over time.

### Evolved structure

```
Browser / mobile client
      │
      ▼
┌──────────────────────────────────────────────┐
│  PatchDesk modular monolith                   │
│                                              │
│  ┌──────────────┐                            │
│  │ Request entry │  ← auth, tenant context, rate limit
│  └──────┬───────┘                            │
│         ▼                                    │
│  ┌──────────────┐   ┌──────────────┐         │
│  │ Permission / │──▶│ Ticket module │         │
│  │ RBAC         │   │ ticket/comment│         │
│  └──────────────┘   └──────┬───────┘         │
│                            │                 │
│  ┌──────────────┐          │                 │
│  │ Audit log     │◀─────────┘                 │
│  └──────────────┘                            │
│                                              │
│  ┌──────────────┐                            │
│  │ Ticket timeline/Outbox │ ← ticket_events/outbox_events
│  └──────────────┘                            │
│                                              │
│  ┌──────────────┐   ┌──────────────┐         │
│  │ Notification  │   │ Search / report│        │
│  │ jobs          │   │ read model     │        │
│  └──────────────┘   └──────────────┘         │
└───────────────┬──────────────────────────────┘
                │
        ┌───────┴───────────┐
        ▼                   ▼
┌──────────────┐     ┌──────────────┐
│ Primary DB    │     │ Job queue     │
│ tenant_id enforced │ │ email/index/report│
└──────────────┘     └──────────────┘
```

The core change is not "split into services." The structure is clearer:

- **Request entry** establishes tenant context in one place.
- **Permission module** decides who can view or change what.
- **Ticket module** handles ticket business, not notification and reporting details.
- **Audit log** records key actions, not as a patch added afterward.
- **Notification / search / reporting** become async side paths first, not main-request blockers.

### Follow one "create ticket" request end to end

```
1. User submits a new ticket.
2. Request entry authenticates and obtains user_id and tenant_id.
3. Permission module checks whether the user may create a ticket in this tenant.
4. Ticket module writes tickets row; data automatically carries tenant_id.
5. In the same transaction, append `ticket_events`: who created which ticket.
6. In the same transaction, write `outbox_events`: which notifications and indexes need updates.
7. After commit, background workers read the Outbox and send email / webhooks / in-app messages asynchronously.
8. Search indexing job updates keyword search asynchronously.
9. User sees success immediately, without waiting for email or indexing.
```

Key points:

- `tenant_id` is not handwritten by each endpoint author; it flows from request context into data access.
- Ticket status transitions are constrained by a state machine, for example a closed ticket cannot jump back to in-progress arbitrarily.
- Authorization is not scattered across endpoints; it is centralized in one module.
- Notification and search-index failure should not roll back ticket creation; Outbox handles later retries.
- Audit logs must be close to key business writes; otherwise they cannot be reliably reconstructed later.

---

## 8. What if it breaks: failure scenarios and fallbacks

| Failure | Direct result | Detection | Architectural fallback |
|---|---|---|---|
| Query misses `tenant_id` | Tenant A may see Tenant B's data | Cross-tenant automated tests, code scanning, data-access review | Force all queries through tenant context; forbid bypassing the data access layer |
| Permission rules scatter | Some endpoints allow unauthorized changes | Permission-matrix tests, audit anomalies | Centralize RBAC; audit key actions |
| Email provider fails | Ticket creation succeeds but nobody is notified | Notification job failure rate, dead-letter queue | Async retry, delivery status visibility, manual resend if needed |
| Email ingress is delivered twice | One email creates multiple tickets / comments | Duplicate message-id, duplicate-content alerts | Use email message-id or external event ID as an idempotency key |
| SLA scheduler misses a run | Overdue tickets do not escalate | SLA lag metric, periodic reconciliation | Make scheduled scans replayable; persist task state |
| Report query hurts primary DB | Normal ticket list slows down too | Slow queries, primary DB CPU, report duration | Report read model, read replica, offline generation |
| Search index lags | New ticket cannot be searched for a short time | Index-lag metric | Show short-delay copy; retry indexing in background |
| Only current state is stored | No accountability, no incident review, missing audit | History cannot answer customer questions | Current state + append-only `ticket_events` |
| Attachments are stored in the database | Backups grow, queries slow down, migration becomes hard | Abnormal DB growth, slower backups | Store attachment files in object storage; keep metadata and permissions in DB |
| Audit log missing | Incident cannot be traced | Audit completeness checks | Write critical action audit in the same transaction; record read-only actions async |

The maturity of ordinary SaaS is not measured by how many services it has. It is measured by whether these boundaries are structurally fixed.

---

## 📌 Validate your reasoning against the templates

This case is not a rewrite of the standard web app template. It takes the most underestimated boundaries in ordinary SaaS and reasons through them.

| Reusable template | What this case reuses | What this case adds |
|---|---|---|
| [Standard Web App](../../templates/standard-web-app/README.md) | Monolith, relational database, cache / queue added when needed | Shows why monolith-first is not no-design, but restraint in a concrete SaaS |
| [Mobile App](../../templates/mobile-app/README.md) | Client identity, weak networks, push entry point | Not expanded here; treated as one PatchDesk entry point |
| [Notification System](../../templates/notification-system/README.md) | Async notifications, retries, delivery state | Shows why email / in-app messages must not block the main request |
| [Security & Multi-Tenancy](../../tutorial/16-安全与多租户架构.md) | Tenant isolation, least privilege, audit | Turns "no tenant leakage" into data-access and testing constraints |

> **Reading suggestion**: read this case first, then return to the [Standard Web App template](../../templates/standard-web-app/README.md). "Monolith first" should now read not as laziness, but as saving complexity budget for the parts that truly bite.

---

## 🎯 Quick check

<Quiz
  question="Why shouldn't PatchDesk version one start directly with microservices?"
  :options="['Because microservices are always bad', 'Because the team is small, QPS is low, and business boundaries are still changing; microservices would introduce distributed complexity before the benefits exist', 'Because a monolith means you do not need module boundaries']"
  :answer="1"
  explanation="The judgment is not 'monolith forever,' but 'modular monolith first.' With a small team, unstable boundaries, and low load, microservices mainly add complexity. The first job is to make tenant, permission, ticket, notification, and reporting boundaries clear."
/>

<Quiz
  question="What is the biggest structural risk of shared-table multi-tenancy?"
  :options="['The database immediately becomes slow because of one extra tenant_id field', 'Isolation depends on every query carrying tenant_id correctly; one omission can leak data across tenants', 'Every tenant must have its own deployed application']"
  :answer="1"
  explanation="Shared tables are cheap, but tenant isolation cannot rely on every developer remembering. Request entry, data access, and automated tests should enforce tenant_id together, turning isolation into structure instead of a memory test."
/>

<Quiz
  question="Why should a ticket update avoid sending all emails and webhooks synchronously before returning?"
  :options="['Because notifications are not important', 'Because external systems can be slow, fail, or duplicate; Outbox and queues make side effects retryable and repairable', 'Because databases cannot store notification records']"
  :answer="1"
  explanation="Ticket current state and the event timeline should be committed in the main transaction. Email, webhooks, and search indexing are external side effects, so Outbox / queues should deliver them asynchronously. The user request stays short, and failures can be retried or compensated."
/>

---

## Case summary

- **Ordinary SaaS still has architecture; it just should not be overdesigned.** PatchDesk version one needs module boundaries, tenant isolation, and centralized permissions more than microservices.
- **It will not be crushed by QPS first; it will be crushed by boundaries.** 200 tenants worth of ticket volume is not scary for a monolith and relational DB. Tenant leaks, unauthorized access, and missing audit are scary.
- **Multi-tenant isolation cannot rely on memory.** Shared tables can work, but `tenant_id` must be enforced structurally: request context, data access, and automated tests together.
- **A ticket is not only current state; it also needs a timeline.** `tickets` stores current state, `ticket_events` stores history, and `outbox_events` stores side effects waiting to be delivered.
- **Slow side effects leave the main path.** Notifications, search indexing, and reports should not make the user wait; async is not showmanship, it keeps the main path short and failures repairable.
- **Start with a modular monolith, then evolve by signals.** Add read models, replicas, or service extraction only after slow search, report load, or team blocking becomes real.

> **Bridge forward**: this case lands the restraint from the [Standard Web App template](../../templates/standard-web-app/README.md) in a concrete SaaS. If the next case moves into AI / RAG, the pressure changes again: not tenant and permission first, but answer trust, retrieval quality, cost, and prompt injection.

---

## Related links

- Template cross-check: [Standard Web App](../../templates/standard-web-app/README.md) · [Mobile App](../../templates/mobile-app/README.md) · [Notification System](../../templates/notification-system/README.md)
- Methodology: [02 · The architect's thinking framework](../../tutorial/02-架构师的思考框架.md) · [07 · Designing from 0 to 1](../../tutorial/07-从0到1设计一个系统.md) · [08 · ADRs & evolution](../../tutorial/08-架构决策记录与演进.md)
- Hard parts: [14 · Evolving & splitting large systems](../../tutorial/14-演进与拆分大型系统.md) · [15 · Organization as architecture](../../tutorial/15-组织即架构.md) · [16 · Security & Multi-Tenancy](../../tutorial/16-安全与多租户架构.md)
