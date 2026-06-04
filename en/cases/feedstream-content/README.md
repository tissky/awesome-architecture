# Case 05 · FeedStream: social feed and video content distribution

> The thesis in one line: **this case drills amplification in content distribution** — the hard part is not storing one post, but giving millions of users their own screen of content while handling creators with huge audiences, viral video, search, recommendation, and CDN cost.

---

> **🧪 Case track, case 5 · This case drills one thing**
>
> Drill architectural judgment for **social feeds + content search + video distribution**: when to push, when to pull, how to handle large creators and viral content, why video needs transcoding and CDN, and how search / recommendation / moderation avoid blocking the main path.
>
> | After reading you should be able to | How this case trains it |
> |---|---|
> | Explain why Feed is not a simple post list query | Use read/write asymmetry and personalized home timelines |
> | Decide between push, pull, and hybrid Feed | Use push for ordinary creators and pull for large creators |
> | See why images / videos should not come from the business origin | Use transcoding, segments, CDN, prewarming, and origin protection |
> | Put search, recommendation, and moderation into content distribution | Use recall / ranking / moderation recall and degradation |
>
> **Important reminder: this is a teaching case, not any social platform's internal blueprint.** The numbers are for order-of-magnitude reasoning. The goal is judgment, not a single correct answer.

---

## Opening: why Feed is not "query posts from people I follow"

Because the real product is not the publish button. It is the screen of content users see every time they open the app.

> **FeedStream** is a text, image, and short-video community. Users follow creators, publish posts or videos, like, comment, search, and see recommendations. Ordinary creators have hundreds of followers. Top creators have millions. When a viral video launches, hundreds of thousands of viewers may open it within minutes.

At first glance, it looks like an ordinary content system:

- users publish posts;
- followers read home feeds;
- people like and comment;
- users search keywords;
- creators upload videos;
- the system recommends content.

But after launch, the real incidents are not "we cannot store posts." They are:

> **Home refresh is slow, one top creator post overloads fanout queues, viral video cache misses crush the origin, and unsafe content has already been distributed into millions of timelines.**

So this chapter is not about "how to make a posts table." It asks a sharper question:

> **How do you distribute massive content to different people while controlling hotspots, ranking, media bandwidth, and content safety?**

The pressure source is different from the previous cases:

- [StarArena](../stararena-ticketing/README.md) fears inventory and payment state.
- [PatchDesk](../patchdesk-saas/README.md) fears multi-tenant boundaries.
- [DocuMind](../documind-rag/README.md) fears answer trust.
- [SyncRoom](../syncroom-collaboration/README.md) fears realtime state convergence.
- **FeedStream fears one write being amplified into massive reads, massive distribution, and massive bandwidth.**

---

## Mini glossary before reading

This chapter repeats a few terms. Here they are in plain language:

| Term | Plain-language meaning |
|---|---|
| Feed | A stream of content shown on the user's home screen. |
| Timeline | An ordered list of content, such as a creator profile timeline or a home timeline. |
| Fan-out | One item is distributed to many recipients. |
| Push model / fan-out on write | When content is published, write its ID into followers inboxes. Reading becomes fast. |
| Pull model / fan-out on read | Publish once, then pull followed creators content when the user refreshes. |
| Hybrid model | Ordinary creators use push; large creators use pull. This avoids huge write fanout. |
| Large creator | A creator with many followers. One post can create extreme fanout. |
| Inbox | A user's Feed candidate list. It usually stores content IDs, not full post bodies. |
| Recall | First fetch a rough candidate set from massive content. |
| Ranking / fine ranking | Score candidates and decide what appears first. |
| CDN | Content Delivery Network. Caches static content such as images and videos near users. |
| Origin fetch | CDN misses cache and has to fetch from origin storage. This is usually slower and more expensive. |
| Transcoding | Process one source video into multiple quality / bitrate versions. |
| ABR | Adaptive Bitrate. The player switches quality based on the current network. |
| Moderation recall | After content is judged unsafe, remove it not only from the post page, but also from Feed, search, recommendation, and caches. |

---

## 1. Starting point: validate supply and consumption before building a recommendation empire

FeedStream version one has a simple goal: **users can follow creators, see followed content, and publish text, images, and short videos.**

The starting constraints look roughly like this:

| Dimension | Starting phase |
|---|---|
| Daily active users | Fewer than 10,000 |
| Creators | 1,000-5,000 |
| Daily content | 5,000-20,000 items |
| Video share | 10%-20% |
| Peak Feed reads | 200-500 QPS |
| Team size | 5-8 engineers |
| Core goal | Prove people publish, read, and interact |
| Must not fail | Home Feed cannot stay empty or slow; unsafe content cannot spread without control |

The right architecture at this point is not a full recommendation platform. It is a **content service + follow graph + simple Feed read path + object storage / CDN**:

```
User publishes content
  │
  ▼
┌────────────────────────────────────────────┐
│ Content service                             │
│ writes post body, media URLs, author,       │
│ visibility, moderation state                │
└──────────────┬─────────────────────────────┘
               ▼
       ┌──────────────┐
       │ Content store │
       │ post / media  │
       └──────────────┘

User refreshes home
  │
  ▼
┌────────────────────────────────────────────┐
│ Feed read service                           │
│ load follow list → fetch recent content     │
│ → simple ranking → return                   │
└────────────────────────────────────────────┘

Images / videos → object storage → CDN
```

This is not under-designed. Without large creators or massive reads, the pull model is simple and good enough to validate the product.

---

## 2. Quantified assumptions: writes will not kill it first; reads and hotspots will

Run the numbers. Suppose FeedStream has grown for half a year:

```
Daily active users: 2,000,000
Monthly active users: 10,000,000
Creators: 500,000
New content per day: 1,000,000
Video content: 200,000 per day
Peak publishing: 2,000-5,000 per second
Peak Feed refresh: 50,000-150,000 QPS
Ordinary user followers: 100-2,000
Mid-tier creator followers: 10,000-200,000
Top creator followers: 1,000,000-20,000,000
Viral video: 500,000 plays in 10 minutes
Target: home refresh P95 < 500ms, publish-to-visible usually < 10s
Video target: first frame < 2s, rebuffering near 0, CDN hit rate > 95%
Moderation target: high-risk content reviewed before broad distribution; unsafe content removed from major surfaces within 5 minutes
```

At this scale, writing content is not the largest problem. The dangerous parts are:

1. **Reads massively outnumber writes**: one post can be read thousands, millions of times.
2. **Follower distribution is extremely skewed**: ordinary creators have hundreds of followers, top creators have millions.
3. **Video bandwidth is real cost**: every extra minute watched costs CDN and bandwidth money.
4. **Unsafe content gets amplified**: stronger Feed and recommendation make spread faster, and recall harder.

So FeedStream's architectural center of gravity is not "how to store posts." It is:

> **Make personalized reads fast, hotspot distribution controlled, media delivery edge-based, and moderation recall a system capability.**

---

## 3. Trigger signals: when version one starts to be insufficient

Once version one is running, do not upgrade by feeling. Watch these signals:

| Signal | What it looks like | Why this is architectural |
|---|---|---|
| Home refresh slows down | Users follow 1,000 people and each refresh aggregates too many sources | Pure pull creates read amplification |
| Large creator post backs up queues | One item must enter millions of follower inboxes | Pure push hits fanout explosion |
| Hot content body reads spike | Viral posts repeatedly fetch the same content body | Missing hot content cache |
| Video origin fetch rises | A new viral video misses CDN and origin bandwidth spikes | Missing prewarming / origin protection |
| New content is not searchable | Content stays invisible in search for minutes | Index freshness is insufficient |
| Recommendation quality swings | Users see duplicates, stale items, or low-quality content | Recall / ranking / dedupe chain is unstable |
| Unsafe content is hard to recall | Post is deleted, but Feed, search, or cache still shows it | Moderation state does not control every distribution surface |
| Like count drifts | Cached counters disagree with interaction logs | Derived counters lack a source of truth |

These signals are not saying "the database is too small." They are saying: **content distribution amplifies everything, including hotspots, cost, and mistakes.**

---

## 4. Core tension: every user needs a different home page

FeedStream has four groups of core objects:

1. **Content / media / author**: what was published, where media lives, and moderation state.
2. **Follow graph / visibility**: who follows whom, who can see this content, blocks and privacy rules.
3. **Timeline / recommendation candidates / ranking result**: where the home screen comes from and why it is ordered this way.
4. **Search / moderation / interaction signals**: whether content can be searched, whether it can keep distributing, and how users respond.

If you look only at the simplest path, it feels like this:

```
User refreshes home → load people I follow → load their recent posts → rank and return
```

A real system must answer at every step:

- If I follow many people, can every refresh query all of them?
- When a top creator posts, should it be written to every follower inbox?
- Should timeline entries store full text or only content IDs?
- Can ranking finish within 500ms?
- Where does video playback come from? What happens on CDN miss?
- If content is later marked unsafe, how is it removed from timelines, search, recommendation, and CDN?

The new architectural statement becomes:

> **Feed is a personalized content distribution engine, not a posts table.**

The key layers are:

```
Content authority layer: post body, media, moderation state, visibility
Distribution layer: timeline inbox, push / pull / hybrid fanout
Ranking layer: candidate recall, coarse ranking, fine ranking, dedupe, diversity
Media layer: transcoding, object storage, CDN, prewarming, origin protection
Safety layer: moderation, takedown, recall, abuse control, visibility filtering
```

---

## 5. Solution reasoning: should Feed push or pull?

This is the most important decision in the case. The core Feed question is: should home timelines be computed ahead of time, or when users refresh?

### Option A: pure pull, compute on refresh

```
User refreshes
  └─▶ load everyone I follow
      └─▶ load their recent content
          └─▶ merge and rank
```

| Benefit | Cost |
|---|---|
| Publishing is light; one write only | Refresh becomes expensive as follow count grows |
| Follow / unfollow takes effect immediately | Feed QPS makes read path hard to scale |
| Simple for MVP | Hard to keep P95 < 500ms |

### Option B: pure push, write into follower inboxes

```
User publishes
  └─▶ load follower list
      └─▶ write content ID into every follower Feed inbox
```

| Benefit | Cost |
|---|---|
| Home reads are very fast: read own inbox | A top creator post creates millions of writes |
| Fits read-heavy systems | Fanout queues and timeline storage get heavy |
| Can precompute part of ranking | Follow graph changes need correction |

### Option C: hybrid push / pull

```
Ordinary creator publishes → push into follower inboxes
Top creator publishes       → write only to creator timeline
User refreshes home         → read inbox + pull followed top creators + rank merge
```

| Benefit | Cost |
|---|---|
| Ordinary content reads fast | Feed read service merges multiple sources |
| Avoids top creator fanout explosion | Top creator content becomes a read hotspot and needs cache |
| Separates by follower threshold | Thresholds and mid-tier creator behavior need tuning |

FeedStream chooses, for growth phase: **hybrid push / pull. Ordinary creators fan out on write; top creators are pulled at read time; both paths merge in Feed read service.**

The key is not "push is better" or "pull is better." The key is:

> **Follower distribution is extremely skewed, so the architecture must split cases. Optimize for the cheap 99%, and isolate the explosive 1%.**

---

## 6. Key architecture decisions: record the "why" with ADRs

ADR means Architecture Decision Record. Feed systems are often questioned later: "Why only store IDs in timelines? Why do top creators not fan out? Why async transcode video? Why does moderation affect distribution?" Those answers should be recorded before memory fades.

### ADR-01: use hybrid Feed instead of pure push or pure pull

- **Context**: reads are far more frequent than writes, so home refresh must be fast; but follower counts are extremely skewed, and top creator fanout can explode.
- **Decision**: creators below a follower threshold fan out on write into follower inboxes; top creators write only to author timelines and are pulled when followers refresh.
- **Gave up**: one distribution strategy for all accounts.
- **Gained**: ordinary users get fast home reads, and top creator posts do not overload fanout queues.
- **Risk**: Feed reads become more complex: merge, dedupe, rank, and cache top creator content.
- **Revisit when**: mid-tier creators frequently hit threshold edges; use active followers, content heat, and account tier to tune dynamically.

### ADR-02: timeline inbox stores content IDs; bodies and media are batch-filled at read time

- **Context**: one hot post can enter millions of inboxes. Copying full text and media data into every inbox would explode storage.
- **Decision**: inbox entries store `post_id`, author, time, and light ranking hints; Feed read service batch-fills body, counters, and media URLs.
- **Gave up**: copying complete content into every inbox.
- **Gained**: storage stays manageable, the content body has one authority copy, and moderation state is easier to apply consistently.
- **Risk**: reads need an extra batch-fill step, and hot content body storage can become a hotspot.
- **Revisit when**: batch-fill becomes a bottleneck; add short caches for hot bodies, counters, and whole Feed pages.

### ADR-03: video upload transcodes asynchronously and distributes through object storage + CDN

- **Context**: source videos are large, user networks vary, and origin distribution would cause buffering and runaway bandwidth cost.
- **Decision**: upload stores the source and returns processing; background workers transcode multiple segment qualities and a manifest; playback goes through CDN, and players use ABR to choose segment quality.
- **Gave up**: synchronous transcoding inside upload requests and origin-serving video files directly.
- **Gained**: upload does not block, playback is smoother, and bandwidth cost is governed by CDN hit rate.
- **Risk**: upload-to-playable has delay; transcode queues and CDN origin fetch need monitoring.
- **Revisit when**: viral content often saturates origin; add prewarming, request coalescing, and multi-CDN strategy.

### ADR-04: moderation state controls Feed, search, recommendation, and CDN

- **Context**: content platforms face illegal, harmful, infringing, or spam content; stronger distribution spreads mistakes faster.
- **Decision**: content has one moderation state; high-risk content is reviewed before broad distribution; takedown events update Feed inboxes, search indexes, recommendation candidates, caches, and CDN; read path re-checks visibility.
- **Gave up**: hiding unsafe content only on the post detail page.
- **Gained**: unsafe content can be recalled from major surfaces, and visibility rules apply on both write and read sides.
- **Risk**: recall is complex and one surface may be missed.
- **Revisit when**: UGC grows; make moderation recall a tier-one capability with takedown regression tests.

---

## 7. Structure and data flow after evolution

FeedStream is not post CRUD. It is content distribution, ranking, media delivery, and moderation recall.

### Starting path

```
User posts → posts table
User refreshes → load follow list → load posts → return
Video playback → origin file URL
```

Problem: read amplification, top creator fanout, video bandwidth, and moderation recall are not structural.

### Evolved structure

```
User publishes
  │
  ▼
┌──────────────────────────────────────────────┐
│ Content service                               │
│ body / visibility / moderation / media meta   │
└──────┬───────────────────────┬───────────────┘
       │                       │
       ▼                       ▼
┌──────────────┐       ┌──────────────────────┐
│ Content store │       │ Media pipeline        │
│ post authority│       │ upload → transcode    │
└──────┬───────┘       │ → object store → CDN  │
       │               └──────────────────────┘
       ▼
┌──────────────────────────────────────────────┐
│ Feed distribution service                     │
│ ordinary creator push → follower inboxes      │
│ top creator author timeline → read-time pull  │
└──────┬───────────────────────┬───────────────┘
       ▼                       ▼
┌──────────────┐       ┌──────────────────────┐
│ Timeline      │       │ Search / ranking     │
│ inbox          │       │ index and features   │
│ user -> post_id│       │ recall / ranking     │
└──────┬───────┘       └──────────┬───────────┘
       ▼                          ▼
┌──────────────────────────────────────────────┐
│ Feed read service                             │
│ read inbox → pull top creators → batch-fill    │
│ → visibility filter → rank / dedupe / diversify│
│ → return one screen                            │
└──────────────────────────────────────────────┘
```

The core change is not "add recommendation." The structure is clearer:

- **Content service** stores the authority copy, media references, moderation state, and visibility.
- **Feed distribution service** decides push or pull and writes timeline inboxes asynchronously.
- **Timeline inbox** stores only content IDs for low-latency reads.
- **Feed read service** merges ordinary content, top creator content, and recommendation candidates, then fills, filters, ranks, and returns.
- **Media pipeline** moves image / video bytes away from business origin into object storage and CDN.
- **Moderation recall** reaches content, Feed, search, recommendation, caches, and CDN.

### Follow one "ordinary creator publishes" flow end to end

```
1. Creator publishes an image post.
2. Content service writes the post authority copy, with status distributable or under review.
3. Feed distribution service loads follower list and sees 800 followers.
4. This is an ordinary account, so it asynchronously writes post_id into 800 follower timeline inboxes.
5. A follower refreshes home and reads latest post IDs from their inbox.
6. Feed read service batch-fills body, counters, and media URLs.
7. Ranking service scores candidates, then dedupes and diversifies.
8. User sees this screen of content.
```

### Follow one "top creator viral video" flow end to end

```
1. Top creator uploads a short video.
2. Upload service stores the source video, enqueues transcoding, and returns processing.
3. Transcoding workers generate 1080p / 720p / 480p segments and manifest.
4. After moderation passes, content service marks the video distributable.
5. Because this is a top creator, Feed distribution does not write post_id into millions of follower inboxes. It writes only to the author timeline.
6. When followers refresh Feed, read service notices they follow this creator and pulls the author timeline.
7. Ranking merges this video into candidates; if score is high enough, it appears in home Feed.
8. Player requests manifest and video segments, usually hitting CDN.
9. If the video is predicted to be hot, top segments are prewarmed to CDN. On misses, origin fetches are coalesced to avoid a stampede.
```

Key points:

- Top creator content avoids write fanout explosion.
- Read-time pull of top creator content needs hotspot cache, or pressure merely moves to author timeline reads.
- Video playback goes through object storage + CDN, not business services.
- Unreviewed content must not enter Feed, search, or recommendation candidates.

---

## 8. What if it breaks: failure scenarios and fallbacks

| Failure | Direct result | Detection | Architectural fallback |
|---|---|---|---|
| Pure pull creates read amplification | Home refresh slows and follow aggregation overloads DB | Feed P95, follow count distribution, query fanout | Move ordinary users to fanout-on-write and precomputed timeline inboxes |
| Pure push meets a top creator | One post creates millions of writes and queues lag | fanout queue lag, fanout count per post | Top creators use read-time pull; tune follower threshold dynamically |
| Timeline stores full bodies | Viral content is copied millions of times and storage explodes | Timeline storage growth | Inbox stores only post_id; read path batch-fills content |
| Top creator timeline lacks cache | Followers refresh and overload author timeline | Author timeline QPS, hot post fill count | Short cache for hot author timelines and hot post bodies |
| Fanout blocks publishing | Publishing is slow or fails | Publish latency, fanout duration | Publish writes authority copy only; fanout runs async |
| CDN hit rate drops | Video first frame slows and origin bandwidth spikes | CDN hit ratio, origin egress | Hot prewarming, layered cache, request coalescing |
| Transcoding queue backs up | Videos take too long to become playable | Queue length, task duration | Elastic transcode workers; fewer qualities for cold content |
| Search index lags | New content cannot be searched, or old unsafe content still appears | Index freshness, stale state hits | Near-realtime indexing; prioritize takedown events |
| Recommendation repeats low-quality content | Users see duplicates or spammy content | Duplication rate, negative feedback, watch time | Deduping, diversity rules, quality filters, feedback loop |
| Unsafe content has spread | Feed, search, and cache still show it | Takedown regression, content-state scanning | Moderation state controls all paths; takedown recalls indexes and caches |
| Visibility checked only in UI | Private content enters unauthorized Feed | Permission penetration tests, reports | Enforce visibility on both fanout and read paths |
| Interaction counters drift | Like / comment counts disagree with logs | Counter reconciliation, abnormal jumps | Counters can be cached, but interaction logs can recompute truth |

Content distribution maturity is not measured by whether home Feed can show posts. It is measured by whether hotspots, unsafe content, origin fetches, and ranking degradation are structurally contained.

---

## 📌 Validate your reasoning against the templates

This case is not a rewrite of social Feed or video streaming templates. It puts the mutually amplifying paths of a content community into one system.

| Reusable template / chapter | What this case reuses | What this case adds |
|---|---|---|
| [Social Feed](../../templates/social-feed/README.md) | Push / pull / hybrid, timeline inboxes, top creator fanout | Explains why ordinary creators push and top creators pull |
| [Video Streaming](../../templates/video-streaming/README.md) | Transcoding, multi-bitrate, object storage, CDN, prewarming | Puts video delivery inside Feed hotspot scenarios |
| [Search Engine](../../templates/search-engine/README.md) | Inverted index, recall + ranking, index freshness | Shows site search and recommendation candidates both need indexing and filtering |
| [Notification System](../../templates/notification-system/README.md) | Async notifications, dedupe, rate limits | Interaction alerts must not block publishing or Feed reads |
| [The mechanics of scale](../../tutorial/13-规模化的力学.md) | Hotspots, fanout, caching, read/write amplification | Treats top creators, viral video, and CDN origin fetch as amplification problems |
| [Security & Multi-Tenancy](../../tutorial/16-安全与多租户架构.md) | Visibility, permissions, isolation | Applies privacy, block lists, and moderation state to distribution |

> **Reading suggestion**: read this case first, then return to the [Social Feed template](../../templates/social-feed/README.md) and [Video Streaming template](../../templates/video-streaming/README.md). Feed and video look separate, but hotspots and distribution cost tie them together.

---

## 🎯 Quick check

<Quiz
  question="Why should FeedStream not use pure push for every creator?"
  :options="['Because push model always has bad read performance', 'Because top creators have too many followers, and one post can create millions of writes; top creators should be pulled at read time', 'Because timelines cannot be precomputed']"
  :answer="1"
  explanation="Push is good for ordinary accounts because reads become fast. Top creators cause fanout explosion. Production Feed usually uses hybrid: ordinary creators push, top creators pull."
/>

<Quiz
  question="Why should timeline inboxes usually store post_id instead of full post bodies?"
  :options="['Because post bodies cannot be stored in databases', 'Because hot content may be referenced by millions of inboxes, and copying full bodies would explode storage and update cost', 'Because Feed does not need post bodies']"
  :answer="1"
  explanation="Store references in inboxes and batch-fill bodies at read time. This avoids copying hot content millions of times and makes moderation state easier to apply consistently."
/>

<Quiz
  question="A viral video launch saturates origin bandwidth. What is most directly missing?"
  :options="['The post table needs more columns', 'CDN hit rate, hot prewarming, or origin protection is missing', 'The follow graph is too complex']"
  :answer="1"
  explanation="Video distribution cost and experience depend heavily on CDN hit rate. Viral content needs prewarming, layered cache, and origin request coalescing."
/>

<Quiz
  question="If unsafe content has entered Feed, search, and recommendation, is deleting only the post detail page enough?"
  :options="['Yes, nobody can view it after the detail page is gone', 'No, it must also be recalled from timelines, search indexes, recommendation candidates, caches, and CDN', 'No need; just wait for cache expiry']"
  :answer="1"
  explanation="The risk of content platforms is distribution amplification. Moderation state must control Feed, search, recommendation, and cache paths, or unsafe content keeps appearing elsewhere."
/>

---

## Case summary

- **Feed is not a posts-table query; it is a personalized distribution engine.** Every user has a different home screen, and reads dominate writes.
- **Hybrid push / pull is the core large-scale Feed trade-off.** Ordinary creators fan out on write for fast reads; top creators are pulled at read time to avoid fanout explosion.
- **Timelines store references; bodies are filled at read time.** This controls storage, hot cache behavior, and moderation consistency.
- **Video content must leave the business origin.** Transcoding, multi-bitrate segments, object storage, CDN, prewarming, and origin protection determine playback quality and bandwidth cost.
- **Recommendation and search are recall + ranking funnels.** Do not recompute the whole world on each refresh; recall candidates first, then score a small set.
- **Moderation recall is part of distribution.** Wherever the system distributes content, takedown must be able to reach.

> **Bridge forward**: this case puts content Feed, search, recommendation, and video CDN into one community product. If the next case moves into AI Agent / coding Agent, the pressure changes again: tool calls, permissions, sandboxing, memory, context, and human approval.

---

## Related links

- Template cross-check: [Social Feed](../../templates/social-feed/README.md) · [Video Streaming](../../templates/video-streaming/README.md) · [Search Engine](../../templates/search-engine/README.md) · [Notification System](../../templates/notification-system/README.md)
- Methodology: [02 · The architect's thinking framework](../../tutorial/02-架构师的思考框架.md) · [07 · Designing from 0 to 1](../../tutorial/07-从0到1设计一个系统.md) · [08 · ADRs & evolution](../../tutorial/08-架构决策记录与演进.md)
- Hard parts: [13 · The mechanics of scale](../../tutorial/13-规模化的力学.md) · [16 · Security & Multi-Tenancy](../../tutorial/16-安全与多租户架构.md)
