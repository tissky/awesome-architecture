# Case 04 · SyncRoom: a realtime collaboration workspace for remote teams

> The thesis in one line: **this case drills ordering and convergence in realtime collaboration** — the hard part is not sending messages, but making everyone eventually see the same trusted collaboration history despite disconnects, reconnects, multiple devices, concurrent edits, and duplicate delivery.

---

> **🧪 Case track, case 4 · This case drills one thing**
>
> Drill architectural judgment for **realtime chat + collaborative documents + notifications**: when simple polling is enough, when long connections become necessary, who owns message ordering, how offline users catch up, how concurrent edits avoid overwriting each other, and which states can be eventually consistent.
>
> | After reading you should be able to | How this case trains it |
> |---|---|
> | Explain why realtime systems cannot rely only on request-response | Use WebSocket long connections, connection routing, and heartbeats |
> | Reason about message order, duplicates, and offline catch-up | Use server seq, ack, retry, idempotent dedupe, and cursor-based pulls |
> | See why collaborative editing cannot use last-save-wins | Use operation logs, single-document serialization, and OT / CRDT |
> | Separate strongly consistent data from relaxed states | Treat messages / documents as core state, and presence / typing / read receipts / notifications as side paths |
>
> **Important reminder: this is a teaching case, not any collaboration product's internal blueprint.** The numbers are for order-of-magnitude reasoning. The goal is judgment, not a single correct answer.

---

## Opening: why "can send messages" is not realtime collaboration

Because remote teams do not only need a chat box that refreshes. They need a system that makes people feel they are working in the same room.

> **SyncRoom** is a realtime collaboration workspace for remote teams. Inside a project room, members can chat, mention teammates, co-edit meeting notes, see who is online, and receive offline push notifications. If someone disconnects and returns, messages must not be lost. If two people edit the same note at the same time, one person's work must not overwrite the other's. Phone, web, and desktop clients should converge on the same unread state and history.

At first glance, it looks like a few ordinary features combined:

- room chat;
- online status;
- typing indicator;
- read / unread state;
- collaborative meeting notes;
- mention alerts and offline push.

But after launch, the real incidents are not "a message arrived one second late." They are:

> **Messages arrive out of order, repeat, or disappear; offline catch-up misses gaps; concurrent document edits overwrite each other; unread and read states fight across devices.**

So this chapter is not about "how to build a WebSocket demo." It asks a sharper question:

> **How do you make chat messages reliable and ordered, collaborative documents convergent, and presence / notifications restrained on an unreliable network?**

The pressure source is different from the first three cases:

- [StarArena](../stararena-ticketing/README.md) fears high concurrency and inventory mistakes.
- [PatchDesk](../patchdesk-saas/README.md) fears multi-tenant boundaries and uncontrolled side effects.
- [DocuMind](../documind-rag/README.md) fears untrustworthy answers and broken evidence chains.
- **SyncRoom fears unreliable realtime networks while users still expect everyone to see the same collaboration history.**

---

## Mini glossary before reading

This chapter repeats a few terms. Here they are in plain language:

| Term | Plain-language meaning |
|---|---|
| WebSocket | A long-lived two-way connection between browser and server. The server can push messages to the client. |
| SSE | Server-Sent Events. The server pushes events one way to the browser. Useful for downstream updates, weaker for complex two-way collaboration. |
| Long connection | A connection that stays open instead of closing after one HTTP request. Realtime systems use it for low-latency push. |
| Heartbeat | Client and server periodically say they are alive. If heartbeats stop, the connection is considered dead. |
| Route table | Records which gateway a user is currently connected to. To push to someone, first find where they are connected. |
| seq | Sequence number. The server assigns increasing numbers inside one room / conversation, and clients display messages by seq. |
| ack | Acknowledgement. The client tells the server: I received this message. |
| Idempotency | Processing the same message multiple times still has the effect only once. Retry creates duplicates, so idempotency is required. |
| Offline catch-up | After a user disconnects or goes offline, they later pull the missing messages from where they left off. |
| Cursor | A position marker such as "I have received / read up to here." |
| Read watermark | A read position: "this user has read up to this seq in this room." Unread counts can be recomputed from it. |
| Presence | Online status, typing state, cursor position, and similar ambient collaboration state. Useful, but usually not strongly consistent. |
| OT | Operational Transformation. It transforms concurrent editing operations into one agreed order so edits do not overwrite each other. |
| CRDT | Conflict-free Replicated Data Type. A data structure where concurrent changes from different clients automatically merge into the same final state. |
| Operation log | Every edit is recorded as an operation instead of only saving final text. It supports replay, audit, and version history. |
| Snapshot | A periodic full copy of the document state, so opening a document does not require replaying every operation from the beginning. |

---

## 1. Starting point: get the realtime basics right first

SyncRoom version one has a simple goal: **let a team of fewer than 20 people chat in project rooms, read history, and co-maintain a meeting note.**

The starting constraints look roughly like this:

| Dimension | Starting phase |
|---|---|
| Team size | 5-8 engineers |
| Room count | Fewer than 1,000 |
| Members per room | 5-30 |
| Concurrent online users | 1,000-5,000 |
| Peak message writes | 50-200 per second |
| Collaborative docs | 1-3 notes per room |
| Core goal | Chat must not be lost or disordered; docs must not overwrite edits |
| Must not fail | A sent message disappears; concurrent editing loses one person's content |

The right architecture at this point is not multi-region active-active or a complex CRDT platform from day one. It is a **central long-connection gateway + message service + operation log + simple collaboration engine**:

```
Browser / mobile client
      │ WebSocket
      ▼
┌────────────────────────────────────────────┐
│ Long-connection gateway                     │
│ heartbeat, connection management, uplink,   │
│ downstream push                             │
└──────────────┬─────────────────────────────┘
               ▼
┌────────────────────────────────────────────┐
│ SyncRoom backend                            │
│ room messages → assign seq → persist        │
│ → deliver / offline catch-up                │
│ collaborative docs → merge op → op log      │
│ → broadcast                                 │
│ presence / notification → async side path   │
└──────────────┬─────────────────────────────┘
               ▼
       ┌──────────────┐
       │ message / op  │
       │ storage       │
       │ snapshots     │
       │ cursors       │
       └──────────────┘
```

This is not "adding complexity early." It establishes the basic realtime floor: **core history is reliable, ambient presence can be relaxed.**

---

## 2. Quantified assumptions: large requests will not kill it first; long connections and disorder will

Run the numbers. Suppose SyncRoom has been adopted by mid-sized remote teams for half a year:

```
Registered teams: 2,000
Active teams: 500
Daily active users: 30,000
Concurrent online users: 8,000-20,000
Devices per user: 1.5-2.2
Peak long connections: 15,000-40,000
Total rooms: 50,000
Active rooms: 5,000
Peak chat messages: 1,000-3,000 per second
Peak presence events: 10,000-50,000 per second
Collaborative document operations: 500-2,000 ops per second
Typical online users per room: 5-50
Large-room online users: 200-1,000
Target: online message P95 < 300ms, offline catch-up P95 < 2s
Collaboration target: local edit shows immediately, remote sync P95 < 500ms
Presence target: may converge within 5-15 seconds
Reliability target: core messages are not lost; duplicate messages display once; same-room messages display by server seq
```

The individual messages are small, but the workload shape is unusual:

1. **Connections are stateful**: if a user is connected to a gateway, pushes must go to that gateway.
2. **The network will disconnect**: mobile backgrounding, weak subway networks, and sleeping laptops all break connections.
3. **Arrival order is not real order**: messages and edits can arrive out of order because of network jitter.
4. **State updates are very frequent**: online, typing, cursor, and read changes outnumber real messages.

So SyncRoom's architectural center of gravity is not "how to process one large request." It is:

> **Make core collaboration history reliable and ordered, while making volatile ambient state eventually consistent and degradable.**

---

## 3. Trigger signals: when version one starts to be insufficient

Once version one is running, do not upgrade by feeling. Watch these signals:

| Signal | What it looks like | Why this is architectural |
|---|---|---|
| Messages sometimes appear out of order | "Received" appears before "can you see this?" | The client sorts by arrival time; there is no server seq |
| Users report missing messages | After reconnect, a few middle messages are gone | No durable cursor or offline catch-up |
| Messages display twice | Under weak network, the same message appears twice | Retry lacks idempotent dedupe |
| Unread differs across devices | Phone shows 3 unread, web shows 0 | Read cursor has no server convergence point |
| Large rooms stutter | Presence events from a 500-person room overload gateways | Ambient state lacks throttling / aggregation / degradation |
| Meeting notes get overwritten | A paragraph written by A disappears after B saves | Collaborative docs are saved like ordinary forms; no op merge |
| Doc jumps after reconnect | Offline edits are replaced by the server snapshot | Offline operations are not merged with OT / CRDT |
| Mention notifications become spam | One discussion triggers repeated multi-device, multi-channel alerts | Notifications lack dedupe, rate limits, and online / offline separation |

These signals are not saying "add more machines." They are saying: **the realtime system lacks reliable delivery, ordering, and merge protocols.**

---

## 4. Core tension: users want realtime feel; the system needs trusted history

SyncRoom has three groups of core objects:

1. **Room / member / connection**: who is in the room, and which gateway they are connected to now.
2. **Message / cursor / notification**: what was sent, who received up to where, who read up to where, and who needs an alert.
3. **Document / operation / snapshot**: what editing intent was made, how it merges, and how the final document is rebuilt.

If you look only at the simplest path, it feels like this:

```
User sends message → server forwards → others display
User edits doc → save latest text → others refresh
```

A real system must answer at every step:

- What is the server-defined order of this message?
- Is the receiver online? Which gateway are they connected to?
- After reconnect, from which cursor should the client catch up?
- Has this retried message already been processed?
- Which device's read state wins?
- If two people edit the same paragraph at the same time, whose intent is preserved?
- Can online status and typing state be dropped or delayed?

The new architectural statement becomes:

> **Core history must be reliable and ordered; collaborative editing must merge intent; ambient state and notifications must degrade gracefully.**

The easy trap is mixing chat messages and collaborative documents as if they were the same consistency problem.

```
Chat messages: append history → ordering, delivery, catch-up, dedupe
Collaborative docs: many users mutate one state → operation merge, convergence, no overwrite
Presence: ambient feel → fast, light, expiring, degradable
```

If all three are forced into one strongly consistent model, the system becomes slow and expensive. If all three are treated as temporary messages, history gets lost, ordering breaks, and edits overwrite each other.

---

## 5. Solution reasoning: what actually makes realtime collaboration reliable?

This is the most important decision in the case. Many realtime demos work until weak networks, multiple devices, offline usage, and concurrent edits show up.

### Option A: polling + last-save-wins

```
Client polls every 3 seconds for new messages
Document saves the entire text each time
The last saver overwrites the previous version
```

| Benefit | Cost |
|---|---|
| Simplest implementation, works with ordinary web stack | Not truly realtime; polling wastes server capacity |
| Document save logic is simple | Concurrent edits lose content; offline merge is almost impossible |

### Option B: WebSocket push, but order is client-owned

```
Client sends message → gateway broadcasts → clients display by local time / arrival time
```

| Benefit | Cost |
|---|---|
| Realtime feel improves a lot | Network jitter causes disorder; retry creates duplicates |
| Good enough for a small-room demo | Offline catch-up, multi-device sync, and unread cursors lack a reliable base |

### Option C: server seq + persistence + ack / retry / dedupe

```
Send message
  └─▶ server assigns room_seq
      └─▶ persist first
          └─▶ deliver online / store cursor for offline
              └─▶ client ack, dedupe and sort by seq
```

| Benefit | Cost |
|---|---|
| Same-room messages have one server-defined order | Need seq assignment, ack, retry, and cursors |
| Offline reconnect can catch up from `last_seen_seq` | Protocol complexity rises |
| Duplicate delivery does not duplicate display | Client and server both store message ID / seq |

### Option D: collaborative documents use operation logs + OT / CRDT

```
User editing does not save the whole document
It sends an operation: insert "decision" at position 10
Server / CRDT engine merges operations
All clients converge to the same document
```

| Benefit | Cost |
|---|---|
| Last-save overwrite disappears | OT / CRDT is harder to understand and implement |
| Offline edits can merge later | Requires operation logs, snapshots, and conflict tests |
| Version history and audit come naturally | The document model moves from "final text" to "operation sequence" |

SyncRoom chooses, for phase one: **chat uses server seq + ack / retry / dedupe; documents use centralized OT or a mature CRDT library; presence and notifications use eventually consistent side paths.**

The key is not merely "use WebSocket." The key is:

> **Realtime is experience; ordering, catch-up, merge, and idempotency are the foundation of trustworthy collaboration.**

---

## 6. Key architecture decisions: record the "why" with ADRs

ADR means Architecture Decision Record. Realtime systems are often questioned later: "Why not sort by client time? Why persist before delivery? Why not save the whole document? Why can online status be inaccurate?" Those answers should be recorded before memory fades.

### ADR-01: use WebSocket long-connection gateways + user connection route table, with SSE / HTTP fallback

- **Context**: realtime experience requires the server to push actively; ordinary HTTP request-response cannot notify online users with low latency.
- **Decision**: clients connect to long-connection gateways through WebSocket; connection open / close updates a `user_id -> gateway_id` route table; delivery checks the route first. Enterprise proxies, weak networks, or read-only observer mode may fall back to SSE downstream + HTTP upstream.
- **Gave up**: short polling as the core realtime mechanism.
- **Gained**: online messages have low latency, the server can find the user's current connection, and read-only scenarios still have a usable fallback.
- **Risk**: long connections are stateful; gateway failure causes many users to reconnect at once, and the route table changes frequently.
- **Revisit when**: connection count exceeds one cluster's capacity or cross-region latency becomes visible; then add nearby access, multi-region gateways, and connection migration. If read-only observers greatly outnumber editors, expand SSE usage.

### ADR-02: chat messages get room-local seq from the server, persist before delivery

- **Context**: client clocks are untrusted, network arrival order is untrusted, and delivery can repeat.
- **Decision**: each room's messages receive increasing `room_seq` from the server; messages are written to durable storage before online delivery or offline catch-up; clients sort by `room_seq` and dedupe by `message_id`.
- **Gave up**: displaying messages by client timestamp / arrival time.
- **Gained**: one ordered history per room, catch-up from `last_seen_seq`, and duplicate-safe delivery.
- **Risk**: hot large rooms may make seq assignment and writes a bottleneck.
- **Revisit when**: one room's write rate gets too high; consider room partitioning, channel splitting, or large-room shared streams + cursor reads.

### ADR-03: collaborative documents store operation logs + snapshots, not last-save-wins

- **Context**: several people can edit the same note at the same time; saving final text drops concurrent intent.
- **Decision**: clients send editing operations; all operations for one document route to one merge worker and are processed serially; the server assigns `doc_seq` / document version to ops; OT or CRDT merges operations; operation logs are persisted and snapshots are generated periodically.
- **Gave up**: whole-document saves where the last writer wins.
- **Gained**: concurrent edits do not overwrite each other, offline edits can catch up and merge from `last_doc_seq`, and version history / audit come naturally.
- **Risk**: OT / CRDT boundaries are complex; rich text, tables, and images magnify algorithmic difficulty.
- **Revisit when**: if offline editing is common and cross-device concurrency is complex, prefer a mature CRDT library; if centralized collaboration is enough, OT + single-document writer is easier to control.

### ADR-04: presence, typing, read receipts, and notifications stay off the core path

- **Context**: online status, typing indicators, cursors, read receipts, and push alerts change frequently but tolerate short inaccuracies.
- **Decision**: presence lives in high-speed storage with TTL; typing broadcasts are rate-limited; read receipts converge through server cursors; notifications enter an async queue, with in-app / long-connection alerts while online and Push / email while offline.
- **Gave up**: strongly consistent transactions for all ambient state.
- **Gained**: core message and document paths are not slowed by high-frequency state; ambient state can degrade; notifications do not spam.
- **Risk**: users may briefly see inaccurate online / read state.
- **Revisit when**: if read state becomes a compliance or contractual promise, raise its durability and acknowledgement level; presence still should not become strongly consistent.

---

## 7. Structure and data flow after evolution

SyncRoom is not a WebSocket endpoint. It is a collaboration system that handles messages, documents, and ambient state in separate layers.

### Starting path

```
User sends message
  └─▶ gateway broadcasts
      └─▶ clients display

User edits note
  └─▶ save whole text
      └─▶ overwrite old version
```

Problem: messages have no shared order, disconnects have no catch-up base, and collaborative docs can be overwritten by the last save.

### Evolved structure

```
Client Web / Mobile / Desktop
      │ WebSocket
      ▼
┌──────────────────────────────────────────────┐
│ Long-connection gateway layer                 │
│ heartbeat, connection management, uplink, push │
└───────────────┬──────────────────────────────┘
                ▼
┌──────────────────────────────────────────────┐
│ SyncRoom core services                         │
│                                              │
│  ┌──────────────┐   ┌──────────────┐         │
│  │ Message       │   │ Collaborative │         │
│  │ service       │   │ doc service   │         │
│  │ room_seq/ack  │   │ op merge      │         │
│  └──────┬───────┘   └──────┬───────┘         │
│         │                  │                 │
│  ┌──────▼───────┐   ┌──────▼───────┐         │
│  │ Message       │   │ op log +      │         │
│  │ storage       │   │ snapshots     │         │
│  └──────────────┘   └──────────────┘         │
│                                              │
│  ┌──────────────┐   ┌──────────────┐         │
│  │ Route table   │   │ Presence /    │         │
│  │ user->gateway │   │ notification  │         │
│  └──────────────┘   │ TTL/queue/rate │         │
│                     └──────────────┘         │
└──────────────────────────────────────────────┘
```

The core change is not "use WebSocket." The structure is clearer:

- **Long-connection gateways** own connections and forwarding, not business order.
- **Message service** assigns room-local seq, persists before delivery, and uses ack / retry / dedupe for reliability.
- **Collaborative document service** handles editing operations, merges with OT / CRDT, and stores operation logs plus snapshots.
- **Route table** solves "which gateway is this user connected to now?"
- **Presence / notifications** are side paths that can be rate-limited, expired, and degraded.

### Follow one "reconnect and catch up" flow end to end

```
1. User A sends a message in room R.
2. Message service assigns room_seq=1042 and writes it to message storage.
3. User B is online; the route table says B is connected to gateway-7, so the message is pushed there.
4. B's network jitters, so ack does not arrive in time.
5. Server retries delivery; B's client dedupes by message_id / room_seq and displays it once.
6. B disconnects for two minutes; room R receives seq=1043-1050 during that time.
7. B reconnects with last_seen_seq=1042.
8. Server returns messages where seq > 1042; client sorts by seq and catches up.
9. Read cursor is updated on the server, and phone / web eventually converge on the same unread state.
```

Key points:

- Message order is defined by server seq, not client time.
- Delivery can repeat; display must be idempotent.
- Offline catch-up uses cursors, not the assumption that Push always succeeds.
- Unread and read state converge through server cursors instead of each client calculating alone.

### Follow one "two people edit the meeting note" flow end to end

```
1. Current document version is v10.
2. User A inserts "Decision: continue" under the title, producing opA.
3. User B simultaneously deletes an old decision paragraph, producing opB.
4. Both ops arrive through WebSocket; arrival order can vary.
5. Ops for the same document route to the same worker and are processed serially.
6. Server assigns doc_seq to merged ops, and the OT / CRDT engine preserves both editing intents.
7. Merged ops are appended to the operation log, producing version v11.
8. Server broadcasts final ops to all collaborators.
9. Every client applies the same ops and converges on the same note.
10. A periodic snapshot saves the full v11 document, so the next open does not replay from the first op.
```

Key points:

- Collaborative editing stores operations, not only final text.
- One document needs a deterministic operation order, otherwise concurrent operations cannot merge reliably.
- Reconnecting clients also carry `last_doc_seq`, so missing document operations can be caught up.
- OT / CRDT is not about deciding who wins; it preserves intent and converges.
- The operation log is the basis for merging, version history, and audit.

---

## 8. What if it breaks: failure scenarios and fallbacks

| Failure | Direct result | Detection | Architectural fallback |
|---|---|---|---|
| Gateway crashes | All users on that gateway disconnect | Connection count drops, reconnect spike | Client exponential backoff reconnect; route table expiry; gateway horizontal scaling |
| Route table is stale | Message goes to the wrong gateway or cannot be delivered | Delivery failure rate, route miss | Route TTL; re-check latest connection after failed delivery; reconnect refreshes route |
| Message pushes before persistence | Push succeeds but history is missing, or service failure loses message | Message ID reconciliation, user reports | Persist before delivery; messages that are not persisted cannot ack successfully |
| Messages sorted by client time | Weak network shows messages out of order | Disorder rate, client logs | Server assigns room_seq; clients display by seq |
| Retry lacks dedupe | Same message appears multiple times | duplicate message_id | Client and server dedupe by message_id / seq |
| Offline catch-up relies only on Push | User opens app and still misses history | last_seen_seq gaps | Push only wakes the app; online clients pull missing messages by cursor |
| Unread is computed locally per device | Phone, web, and desktop disagree | Multi-device state diff | Server stores read watermark / read_cursor; clients eventually converge |
| Unread count is only cached increment / decrement | Missed decrement or repeated decrement stays wrong | Unread count vs seq diff | Count can be cached, but must be recomputable from read watermark + message seq |
| Large-room presence broadcasts everything | Online / cursor / typing events overload gateway | Presence QPS, broadcast volume | Rate-limit, sample, aggregate; send only to users viewing the room |
| Last-save-wins overwrites docs | Concurrent editing loses content | Document diff, user feedback | Operation log + OT / CRDT; forbid whole-document overwrite saves |
| Operation replay fails | Opening the document shows inconsistent state | Snapshot check, op replay tests | Immutable op log; periodic snapshots; quarantine and repair bad ops |
| CRDT / OT edge cases are untested | Rich text, table, or image edits drift | Collaboration fuzz tests, replay tests | Build concurrent-edit test sets; split complex structures into independently collaborative blocks |
| SSE is treated as a universal two-way channel | Upstream still needs HTTP and editing feels worse | Fallback latency, retry volume | SSE is good for read-only / fallback; primary editing uses WebSocket |
| Notifications spam users | Mentions repeat across devices and channels | Notification dedupe rate, unsubscribe rate | Async notification queue; dedupe by event ID; in-app first while online, Push only when offline |

Realtime collaboration maturity is not measured by how fast a demo message flies across the screen. It is measured by whether weak networks, reconnects, duplicates, and concurrent edits are covered by protocol.

---

## 📌 Validate your reasoning against the templates

This case is not a rewrite of the realtime chat or collaborative document templates. It separates the state types that are often mixed together in a remote-team product.

| Reusable template / chapter | What this case reuses | What this case adds |
|---|---|---|
| [Realtime Chat](../../templates/realtime-chat/README.md) | Long connections, route table, server seq, ack / retry / dedupe, offline catch-up | Places chat messages inside team rooms and multi-device unread state |
| [Collaborative Doc](../../templates/collaborative-doc/README.md) | Operation logs, single-document serialization, OT / CRDT, snapshots | Puts collaborative editing next to chat, presence, and notifications in one product |
| [Notification System](../../templates/notification-system/README.md) | Async notifications, dedupe, rate limits, multi-channel delivery | Shows online alerts through long connections and offline wake-up through Push / email |
| [Distributed systems: hard truths](../../tutorial/10-分布式系统的硬道理.md) | Unreliable networks, partial failure, retry | Treats disconnects, reconnects, and duplicate delivery as default |
| [Data consistency engineering](../../tutorial/11-数据一致性工程.md) | Idempotency, retry, eventual consistency, compensation | Makes message delivery and read cursors recoverable protocols |
| [Designing for failure](../../tutorial/12-为失败而设计.md) | Degradation, isolation, circuit breaking | Presence and notifications can degrade without hurting core messages and documents |

> **Reading suggestion**: read this case first, then return to the [Realtime Chat template](../../templates/realtime-chat/README.md) and [Collaborative Doc template](../../templates/collaborative-doc/README.md). Both are realtime, but they solve different reliability problems.

---

## 🎯 Quick check

<Quiz
  question="Why should SyncRoom not sort messages in the same room by client time?"
  :options="['Because client clocks and network arrival order are unreliable, so the server should assign room-local seq', 'Because clients cannot display timestamps', 'Because every message needs one global order across the whole product']"
  :answer="0"
  explanation="Realtime messages only need a shared order inside the same room. Client time and arrival order are unreliable, so the server assigns room_seq and clients display by seq."
/>

<Quiz
  question="Which mechanisms usually combine to avoid losing messages while avoiding duplicate display?"
  :options="['WebSocket alone is enough', 'Persist first, ack, retry, and idempotent dedupe by message_id / seq', 'Push notification alone']"
  :answer="1"
  explanation="Reliable delivery must handle network failure. Persistence prevents loss, ack and retry ensure eventual delivery, and idempotent dedupe handles duplicates."
/>

<Quiz
  question="Why is last-save-wins wrong for co-editing meeting notes?"
  :options="['Because saving whole text uses too much disk', 'Because concurrent editing loses other people editing intent; use operation logs + OT / CRDT merge instead', 'Because documents can only be edited by one person']"
  :answer="1"
  explanation="Collaborative editing should preserve concurrent intent and converge. Last-save-wins directly loses content and is not real collaboration."
/>

<Quiz
  question="How should presence data such as online status, typing, and cursor position be handled?"
  :options="['Make it strongly consistent and durable like messages', 'Store it in expiring fast state, rate-limit broadcasts, and tolerate short inaccuracies', 'Broadcast every change to everyone with no limits']"
  :answer="1"
  explanation="Presence creates ambient collaboration feel, but it is not core history. It changes frequently and should use TTL, rate limits, aggregation, and eventual consistency."
/>

---

## Case summary

- **Realtime is not the core; trusted collaboration history is.** WebSocket is only the channel. Server seq, persistence, ack, catch-up, and dedupe make chat reliable.
- **Chat and collaborative documents are different problems.** Chat appends history and needs ordered delivery; documents mutate shared state and need OT / CRDT merge and convergence.
- **Offline catch-up cannot rely on Push.** Push wakes the app; actual catch-up uses server history and client cursors.
- **Multi-device state needs a server convergence point.** Unread / read state cannot be calculated independently on each client forever.
- **Presence can be relaxed.** Online, typing, and cursor position may be briefly inaccurate; they need rate limits and degradation, not competition with the core path.
- **Operation logs fit collaboration better than final text.** They support merge, replay, version history, and audit.

> **Bridge forward**: this case combines [Realtime Chat](../../templates/realtime-chat/README.md), [Collaborative Doc](../../templates/collaborative-doc/README.md), and [Notification System](../../templates/notification-system/README.md) inside one product. If the next case moves into content feed / video distribution, the pressure changes again: fanout amplification, hot content, recommendation, search, and CDN delivery.

---

## Related links

- Template cross-check: [Realtime Chat](../../templates/realtime-chat/README.md) · [Collaborative Doc](../../templates/collaborative-doc/README.md) · [Notification System](../../templates/notification-system/README.md)
- Methodology: [02 · The architect's thinking framework](../../tutorial/02-架构师的思考框架.md) · [07 · Designing from 0 to 1](../../tutorial/07-从0到1设计一个系统.md) · [08 · ADRs & evolution](../../tutorial/08-架构决策记录与演进.md)
- Hard parts: [10 · Distributed systems: hard truths](../../tutorial/10-分布式系统的硬道理.md) · [11 · Data consistency engineering](../../tutorial/11-数据一致性工程.md) · [12 · Designing for failure](../../tutorial/12-为失败而设计.md)
