# Case 03 · DocuMind: an enterprise RAG knowledge base for a 500-person company

> The thesis in one line: **this case drills trustworthy AI answers** — RAG is not throwing documents at AI; it is giving AI authorized, retrievable, citable, and testable evidence, so it answers from sources and says it does not know when evidence is missing.

---

> **🧪 Case track, case 3 · This case drills one thing**
>
> Drill architectural judgment for an **enterprise RAG knowledge base**: when to use RAG instead of long context / fine-tuning, how documents should be chunked and indexed, how vector / keyword / graph retrieval work together, and how to control hallucination, permission leaks, prompt injection, and token cost.
>
> | After reading you should be able to | How this case trains it |
> |---|---|
> | Explain why a RAG system is not just a chat box | Separate offline document ingestion from online retrieval and generation |
> | Decide how chunking, vector search, keyword search, graph retrieval, and reranking work together | Use hybrid retrieval + Graph RAG + reranking + citations to stabilize answer quality |
> | Put permissions and citations into the architecture, not patches | Store ACLs in chunk metadata and force source citations during generation |
> | See how AI systems do quality regression | Use eval sets, retrieval metrics, citation hit rate, and refusal rate to detect degradation |
>
> **Important reminder: this is a teaching case, not any enterprise knowledge-base product's internal blueprint.** The numbers are for order-of-magnitude reasoning. The goal is judgment, not a single correct answer.

---

## Opening: why an enterprise knowledge base is not done by "connecting a model"

Because the most common enterprise AI need is not a universal robot. It is helping employees read fewer docs, ask fewer repeated questions, and avoid old mistakes.

> **DocuMind** is an internal knowledge-base assistant for a 500-person company. The company has product manuals, support SOPs, sales proposals, contract templates, technical runbooks, HR policies, and meeting notes. Employees want to ask: "What is the enterprise refund policy?" "Can this customer use a special discount?" "What is the escalation process for a production incident?"

At first glance, it looks like a chat box:

- user enters a question;
- the system searches documents;
- a large model generates an answer;
- the page shows the result.

But after launch, the most dangerous failure is not "the answer is a bit slow." It is:

> **AI confidently gives the wrong answer, cites a nonexistent source, or leaks HR / legal / customer-private documents to someone without permission.**

So this chapter is not about "how to call a model API." It asks a sharper question:

> **How do you make AI answer only from documents the current user may access, with every key claim traceable to the original source?**

The pressure source is different from the first two cases:

- [StarArena](../stararena-ticketing/README.md) fears high concurrency and inventory mistakes.
- [PatchDesk](../patchdesk-saas/README.md) fears multi-tenant boundaries and uncontrolled side effects.
- **DocuMind fears untrustworthy answers, permission leaks, runaway cost, and silent quality regression.**

---

## Mini glossary before reading

This chapter repeats a few terms. Here they are in plain language:

| Term | Plain-language meaning |
|---|---|
| RAG | Retrieval-Augmented Generation. Search relevant material first, then let the model answer based on it. |
| LLM | Large Language Model. It reads the evidence and writes the answer. |
| Token | The unit a model processes. More text and more retrieved material mean more tokens, higher cost, and higher latency. |
| Embedding | Turns a piece of text into a numeric vector, so the system can search by semantic similarity. |
| Chunk | A document block. Long documents are split into smaller pieces, and each piece is indexed and retrieved. |
| Vector database | A database specialized for storing vectors and finding semantically similar content. |
| Knowledge graph | Knowledge organized as "entities + relationships." For example, "Customer A belongs to Group B" or "Contract C includes Clause D." |
| Entity / relationship | Entities are people, products, customers, contracts, systems, and similar objects. Relationships connect them, such as "owns," "depends on," "applies to," or "belongs to." |
| Graph RAG / knowledge-graph RAG | Retrieval first finds relevant entities and relationships in a graph, then combines them with document chunks for generation. It is strong for relationship-heavy questions such as "who is related to whom," "how does this rule propagate," or "does this customer qualify for this policy?" |
| Keyword search / BM25 | Traditional search. BM25 is a common ranking algorithm, useful for exact terms such as names, product models, and contract IDs. |
| Hybrid retrieval | Vector retrieval + keyword retrieval together. One understands meaning; the other catches exact terms. |
| Rerank | Recall a broader candidate set first, then use a more precise model to reorder candidates and keep the pieces that truly answer the question. |
| Top-K | Keep the top K results. For example, top-6 means only the 6 most relevant chunks go to the model. |
| Citation | The answer points back to which document and paragraph supports it. Enterprise Q&A is hard to trust without citations. |
| Hallucination | The model invents plausible-looking content without evidence. |
| Prompt injection | A document or user input hides malicious instructions such as "ignore previous rules," trying to steer the model. |
| ACL | Access Control List. It records who can see which document. |
| Eval set | A set of standard questions, source documents, and expected behavior used to check whether system changes made quality worse. |

---

## 1. Starting point: prove trustworthy answers before building a platform

DocuMind version one has a simple goal: **when employees ask common policy, product, and process questions, they get answers with sources.**

The starting constraints look roughly like this:

| Dimension | Starting phase |
|---|---|
| Pilot users | 50-100 |
| Document scale | 5,000-20,000 documents |
| Document sources | Drive, internal wiki, PDF, Word, web pages |
| Daily Q&A | 500-2,000 |
| Peak Q&A | 1-3 QPS |
| Team size | 3-5 engineers |
| Core goal | Prove employees want it and answers are source-backed |
| Must not fail | Unauthorized documents must not enter answers; no-evidence questions must not be invented |

The right architecture at this point is not a self-trained large model, and not a complex Agent platform from day one. It is a **hosted model API + simple RAG pipeline + clear permission metadata + eval set**:

```
Document sources
  │
  ▼
┌────────────────────────────────────────────┐
│ Offline ingestion pipeline                  │
│ parse → clean → chunk → permission metadata │
│ → embedding                                 │
└──────────────┬─────────────────────────────┘
               ▼
     ┌──────────────────┐
     │ Knowledge index   │
     │ vector + keyword  │
     │ + metadata        │
     └────────┬─────────┘
              │
User question ▼
  │      ┌──────────────────┐
  └────▶│ Online QA service  │
        │ auth → retrieve    │
        │ rerank → context   │
        │ LLM → citation     │
        │ check → answer     │
        └──────────────────┘
```

This is not "just a wrapper." The hard part of RAG is not the chat box; it is the evidence chain behind it.

---

## 2. Quantified assumptions: QPS will not kill it first; quality will

Run the numbers. Suppose DocuMind has been rolled out internally for half a year:

```
Employees: 500
Active users: 300
Total documents: 80,000
Active knowledge sources: product docs, support SOPs, legal templates, sales material, technical runbooks, HR policies
Average document length: 3,000-8,000 tokens
Chunk size: 500-800 tokens, overlap 80-120 tokens
Chunk count: 400K-1M
New / updated documents per day: 500-1,500
Daily Q&A: 5,000-15,000
Peak Q&A: 5-10 QPS
Retrieval target: recall + rerank within 800ms
Retrieval quality: Recall@20 >= 85%, post-rerank top-5 hit rate >= 75%
Answer target: first token < 2s, full answer P95 < 10s
Quality target: citation hit rate > 95% on frequent questions, refusal rate > 90% on no-evidence questions
Safety target: unauthorized chunks entering model context = 0
Cost target: only necessary evidence enters context; never shove whole documents into every prompt
```

That QPS is not scary for an ordinary web service. The system is more likely to be crushed by four different things:

1. **Bad retrieval**: the answer exists, but the system fails to find the right chunks.
2. **Context pollution**: retrieved content is similar but not answer-bearing, so the model gets steered by noise.
3. **Permission mistakes**: content the user cannot access is retrieved and appears in the answer.
4. **Invisible quality**: after changing the model, chunking, or prompt, answer quality gets worse and nobody knows.

So DocuMind's architectural center of gravity is not "how to handle 100K QPS." It is:

> **Make answer quality, evidence sources, permission boundaries, and cost budgets structural, instead of assuming the model will always behave.**

---

## 3. Trigger signals: when version one starts to be insufficient

Once version one is running, do not upgrade by feeling. Watch these signals:

| Signal | What it looks like | Why this is architectural |
|---|---|---|
| Answers have no citations | User asks about policy; AI gives a plausible paragraph with no source | In enterprise settings, unverifiable answers are hard to trust |
| Citations are wrong | It cites document A, but the answer was actually guessed | Generation and evidence are not bound; citation validation is needed |
| Exact terms fail | Product models, contract IDs, and names are often missed | Pure vector retrieval is weak on exact matching; keyword search is needed |
| Permission filtering is too late | Sensitive chunks are retrieved first, then hidden in the UI | Sensitive content has already entered model context; leakage has happened |
| Updates still answer old rules | A new policy is uploaded, but the system cites the old version | Ingestion lacks versioning, incremental updates, and freshness metrics |
| Prompt injection works | A document says "ignore system rules," and the model follows it | Retrieved content is treated as trusted instruction instead of untrusted evidence |
| Token cost rises | Each answer sends 20 large chunks; the bill grows quickly | Missing top-K limits, summarization, caching, and model routing |
| Quality drops after a change | A chunking change lowers recall, but nobody notices | There is no eval set and no regression gate |

These signals are not saying "the model is not strong enough." They are saying: **the evidence chain and control plane are not architectural yet.**

---

## 4. Core tension: AI can talk, but enterprises need evidence

DocuMind's core objects are not just "chat messages." They are three groups:

1. **Document / chunk / version**: where material came from, which version it is, and how it was split.
2. **Permission / metadata / source**: who may see it, which department it belongs to, and whether citations can return to the original.
3. **Question / retrieval result / answer / eval record**: what the user asked, what was found, what the model answered from, and whether it was good.

If you look only at the simplest path, it feels like this:

```
User question → vector search → retrieve snippets → send to LLM → return answer
```

A real system must answer at every step:

- Which documents may this user access?
- Is this chunk from the latest version?
- Do these chunks truly answer the question, or are they only semantically similar?
- Can every key claim in the answer point to a citation?
- If a retrieved document contains malicious instructions, will the model follow them?
- How many tokens did this answer cost, and was it worth it?

The new architectural statement becomes:

> **Do not treat RAG as "vector search + model." Treat it as an evidence production line.**

That production line has two paths:

```
Offline path: document → parse → chunk → permission metadata → vector / keyword indexes
Online path: question → auth → retrieve → rerank → assemble evidence → generate → citation check → eval log
```

The offline path decides whether material can be found correctly. The online path decides whether found material can be safely, frugally, and verifiably given to the model.

---

## 5. Solution reasoning: how should retrieval work?

This is the most important decision in the case. Many RAG prototypes fail not because the model is weak, but because retrieval is naive.

### Option A: long context, send whole related documents to the model

```
User question + full product manual + full policy document → LLM
```

| Benefit | Cost |
|---|---|
| Simplest implementation; no complex index required | As documents grow, context does not fit, cost and latency rise quickly |
| Small demos may look good | Noise grows; the model can miss the key paragraph |

### Option B: pure vector retrieval

```
Question vector → vector database top-K → LLM
```

| Benefit | Cost |
|---|---|
| Finds semantic similarity and is quick to build | Unstable for IDs, names, product models, and clause numbers |
| Good when question wording differs from document wording | Similar does not mean answer-bearing; plausible but weak chunks get recalled |

### Option C: hybrid retrieval + reranking + citation constraints

```
Question
 ├─▶ vector retrieval: semantic matches
 ├─▶ keyword retrieval: exact terms
 └─▶ merge candidates → rerank → top-K evidence chunks → LLM → citation check
```

| Benefit | Cost |
|---|---|
| Combines semantic and exact matching; production quality is steadier | More components; requires tuning and evals |
| Reranking filters "looks similar" into "actually relevant" | Adds latency and cost; candidate count must be controlled |
| Citation constraints make answers verifiable | Requires chunk IDs, document versions, and source positions |

### Option D: knowledge-graph RAG, find entities and relationships before evidence documents

```
Question: can this customer use the enterprise special discount?
  ├─▶ entity recognition: customer, group, contract, product line, region, sales owner
  ├─▶ graph query: customer → parent group → contract → applicable clause → approval rule
  ├─▶ document retrieval: find source evidence around those entities and clauses
  └─▶ LLM: answer from graph relationships + document citations
```

| Benefit | Cost |
|---|---|
| Strong for cross-document, multi-hop relationship questions, such as customer ownership, system dependencies, and policy applicability | Building the graph is expensive: entity extraction, relationship extraction, disambiguation, and continuous updates |
| Can explain why a rule applies or does not apply, not just return similar documents | If the graph is wrong, it steers the answer wrong in a more hidden way |
| Makes permission, version, and lineage tracking clearer | Graph nodes and edges also need permissions and sources, or they can leak data too |

Knowledge-graph RAG is not "more advanced than vector RAG, so always use it." Add it when these signals appear:

- Users often ask "how is A related to B," "which group owns this customer," or "which systems does this service depend on?"
- Answers require reasoning across multiple documents; one chunk rarely answers the question by itself.
- The organization already has stable master data, such as customers, contracts, products, systems, people, and departments.
- The business cares about relationship chains and applicability, not only finding one paragraph.

Compare the retrieval routes side by side:

| Approach | Strong at | Weak at | When to add it |
|---|---|---|---|
| Vector RAG | Similar meaning with different wording | Exact IDs and complex relationships | MVP and most ordinary document Q&A |
| Hybrid RAG | Semantic + exact-term retrieval | Cross-document relationship reasoning | Main production path for enterprise knowledge bases |
| Graph RAG | Entity relationships, policy applicability, dependency chains, impact analysis | Graph construction is costly; wrong relationships can mislead answers | Add after relationship questions grow, manual investigation is expensive, and evals show ordinary RAG has hit its limit |

DocuMind chooses, for phase one: **hybrid retrieval + reranking + required citations; knowledge-graph RAG is a second-phase enhancement for relationship-heavy areas, not a day-one full graph build.**

The key is not merely "use a vector database." The key is:

> **Retrieval results must satisfy relevance, permission, version, relationship correctness, and cost budget at the same time. Semantic similarity alone is not enough.**

---

## 6. Key architecture decisions: record the "why" with ADRs

ADR means Architecture Decision Record. AI systems are often questioned later: "Why not fine-tune? Why not use long context? Why require citations? Why build evals?" Those answers should be recorded before memory fades.

### ADR-01: use RAG instead of putting enterprise knowledge into model weights

- **Context**: company documents change often, many have permission boundaries, and answers must be traceable.
- **Decision**: use RAG. Documents stay on the enterprise side; at question time, retrieve only relevant snippets the current user may access, then let the model answer.
- **Gave up**: fine-tuning the model to memorize enterprise knowledge in phase one; sending whole documents into long context every time.
- **Gained**: updateable knowledge, citable answers, controllable permissions, and more manageable cost.
- **Risk**: answer quality depends heavily on retrieval quality. If retrieval is wrong, the model will be wrong too.
- **Revisit when**: if the problem is only tone / format, fine-tuning may help; if knowledge is tiny and fixed, long context may work; if knowledge changes and needs citations, RAG remains the main path.

### ADR-02: document ingestion must be replayable and store chunk-level permission, source, and version

- **Context**: enterprise documents are not visible to everyone, and the same policy may have multiple versions.
- **Decision**: after parsing, split documents by structure; every chunk stores metadata such as `source_id`, `doc_id`, `doc_version`, `chunk_version`, `source_url`, `section`, `acl`, `updated_at`, and `parser_status`; parsing, chunking, embedding, and indexing can be replayed by version; documents that fail parsing enter a quarantine queue and do not enter the online index.
- **Gave up**: storing only bare text and a vector.
- **Gained**: retrieval can filter by permission and version first; citations can return to the source; old versions can be retired; if chunking strategy or embedding model changes, indexes can be rebuilt reliably.
- **Risk**: ingestion becomes more complex; parsing, chunking, and permission sync can all fail.
- **Revisit when**: if the permission model becomes more complex, make ACL sync and index updates a dedicated reliable pipeline, and add permission regression tests.

### ADR-03: answers must pass citation constraints, refusal policy, and eval regression

- **Context**: enterprises do not fear AI saying "I do not know"; they fear confident answers without evidence.
- **Decision**: the generation prompt requires answers based only on evidence chunks; every key claim cites a source; insufficient evidence leads to refusal; every model, prompt, chunking, or retrieval change runs an eval set first.
- **Gave up**: an experience-first path where any natural-sounding answer is acceptable.
- **Gained**: verifiable answers, detectable quality regression, and safer high-risk answers.
- **Risk**: refusal rate may rise; users may feel the system is less clever.
- **Revisit when**: if refusals are too frequent, inspect retrieval recall and document coverage first; do not relax model constraints first.

### ADR-04: knowledge-graph RAG covers relationship-heavy domains first

- **Context**: later DocuMind will face many relationship questions, such as "which group owns this customer," "which products are affected by this system failure," or "which contracts does this policy apply to." One similar document chunk rarely answers these reliably.
- **Decision**: start with a lightweight knowledge graph for stable master-data domains such as customers, contracts, products, and system dependencies; graph nodes and edges must store source, version, ACL, and confidence; online retrieval uses the graph to find entity relationships, then returns to source chunks for citations.
- **Gave up**: automatically extracting a company-wide graph from every document on day one.
- **Gained**: cross-document relationship questions become steadier; answers can explain why things are related and trace each relationship to source material.
- **Risk**: entity and relationship extraction can be wrong; stale graphs can systematically mislead answers.
- **Revisit when**: relationship-heavy questions become common, master data is stable, and ordinary hybrid retrieval repeatedly fails to explain relationship chains.

---

## 7. Structure and data flow after evolution

DocuMind is not a chat box. It is an offline + online evidence system.

### Starting path

```
User question
  └─▶ embed question
      └─▶ vector DB top-5
          └─▶ put snippets in prompt
              └─▶ LLM answers
```

Problem: permissions, versions, exact terms, citations, and evals are not structurally fixed. As documents and users grow, it will drift.

### Evolved structure

```
════════════ Offline: turn documents into retrievable evidence ════════════

Document sources
PDF / Word / Wiki / web pages / spreadsheets
      │
      ▼
┌──────────────────────────────────────────────┐
│ Ingestion pipeline                            │
│ parse / OCR → clean → structure-aware chunking│
│ → permission metadata → embedding             │
│ → entity/relationship extraction → indexes    │
└───────────────┬──────────────────────────────┘
                ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Source docs   │   │ Vector index  │   │ Keyword index│   │ Graph index  │
│ files+version │   │ chunk + ACL   │   │ chunk + ACL  │   │ entity/edge  │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘

════════════ Online: turn questions into citable answers ════════════

User question
  │
  ▼
┌──────────────────────────────────────────────┐
│ Online QA service                             │
│ auth → query rewrite → entity recognition /   │
│ graph expansion (optional) → permission-       │
│ filtered retrieval → hybrid recall → rerank   │
│ → evidence                                    │
│ assembly → LLM generation → citation check    │
│ → logging                                     │
└───────────────┬──────────────────────────────┘
                ▼
          Cited answer / refusal
```

The core change is not "add a model." The structure is clearer:

- **Ingestion pipeline** turns different document formats into clean, retrievable, permissioned evidence chunks.
- **Vector index** handles semantic recall when question wording differs from document wording.
- **Keyword index** handles exact recall for models, IDs, names, and clause numbers.
- **Graph index** handles relationship recall for customer ownership, policy applicability, and system dependencies.
- **Reranker** selects chunks that actually answer the question from a broader candidate set.
- **Evidence assembler** controls top-K, token budget, and source format, so noise does not flood the model.
- **Citation check and eval logs** make answer quality inspectable and regressions detectable.

### Follow one "enterprise refund policy" question end to end

```
1. Employee asks: what is the enterprise refund policy?
2. Online QA authenticates and obtains user_id, department, role, and accessible document scope.
3. Query rewrite expands the question for retrieval, such as "enterprise refund policy contract cancellation".
4. Vector retrieval recalls semantically related policy / contract chunks.
5. Keyword retrieval recalls chunks containing exact terms such as "enterprise", "refund", and "cancellation".
6. Candidates from both paths are merged and deduplicated, then filtered to chunks this user may access.
7. Reranker picks the 5-8 chunks most able to answer the question.
8. Evidence assembler puts chunk ID, document title, version, section position, and text into the prompt.
9. LLM may answer only from those evidence chunks, and every key claim must cite a source.
10. Citation checker verifies cited IDs exist and came from this retrieval result.
11. If evidence is insufficient, the system says it did not find enough support instead of inventing.
12. The system logs question, retrieval result, citations, tokens, latency, and user feedback for eval and debugging.
```

Key points:

- Permission filtering happens before retrieval context assembly, not after answer generation.
- Citations must point to real chunks and document versions; the model cannot freely invent sources.
- Retrieved document text is evidence, not instruction. A document saying "ignore system rules" must not take effect.
- Refusing when evidence is missing is correct behavior, not failure.
- Each answer leaves retrieval and generation logs; otherwise quality incidents cannot be investigated.

---

## 8. What if it breaks: failure scenarios and fallbacks

| Failure | Direct result | Detection | Architectural fallback |
|---|---|---|---|
| Parser loses tables | Prices, limits, and exceptions disappear | Parse sampling, table coverage | Extract tables separately; manually validate key docs |
| Failed parse still enters the index | Garbled or partial content becomes evidence | `parser_status`, garble rate, sampling | Failed documents enter a quarantine queue and are replayed after repair |
| Chunks are too large | Retrieved chunks contain too much noise and the model grabs the wrong point | Human review of hit chunks, abnormal token use | Chunk by headings / paragraphs and cap chunk size |
| Chunks are too small | Retrieved snippets lack context and answers become misleading | Incomplete citations, user feedback | Add overlap; include title and parent section in chunk context |
| Pure vector search misses exact terms | Contract IDs, product models, and names are not found | Low recall on exact-query eval set | Add keyword search / BM25, then hybrid recall |
| Permission filtering is too late | Sensitive documents enter model context | Permission penetration tests, log audit | Filter by ACL during retrieval; store permissions at chunk level |
| Document version is stale | AI cites old policy | Index freshness, old-version hit rate | Version documents, retire old chunks, rebuild indexes incrementally |
| Prompt injection works | Documents steer the model to override rules | Red-team tests, injection eval cases | Mark retrieved text as untrusted evidence; separate system instructions from evidence |
| Entity extraction is wrong | Customer, product, or contract relationships are linked incorrectly | Graph sampling, entity-disambiguation evals | Low-confidence relationships do not enter the online graph; manually review critical entities |
| Graph relationship is stale | Policy applicability uses old rules | Relationship update time, old-version hit rate | Relationships carry version and source chunk; retiring a document also retires its relationships |
| Graph permission filtering is missed | User sees unauthorized entities through a relationship path | Permission penetration tests, graph-query audit | Graph nodes and edges carry ACLs; filter before retrieval, not after generation |
| Graph path lacks source evidence | Answer has a plausible reasoning path but cannot be verified | Path citation validation failure rate | Every relationship must point back to a source chunk; source-less relations can be hints, not answer evidence |
| Citations are fabricated | Answer appears sourced but cannot be checked | Citation ID validation failure rate | Allow citations only from retrieved chunks; validate after generation |
| Model answers without evidence | Hallucination causes wrong decisions | No-answer eval cases, user feedback | Refuse when evidence is insufficient; improve recall instead of loosening constraints |
| Cost suddenly rises | Token bill grows and latency increases | Tokens per question, top-K, context length | Limit top-K, cache popular Q&A, route simple questions to smaller models |
| Generation continues after budget is exceeded | One question burns through budget and becomes slow | Per-question budget, user / department quota | Return related source list, use a smaller summarizer, or route to human review |
| Quality regresses after a change | Prompt / model / chunking update makes answers worse | CI eval set, online A/B | Do not release if evals fail; keep rollback versions |
| Vector index is unavailable | Q&A fails or times out | Retrieval error rate, dependency health check | Degrade to keyword search; if needed, return source list without generated answer |

Enterprise RAG maturity is not measured by how human the answer sounds. It is measured by whether wrong answers can be detected, constrained, and repaired.

---

## 📌 Validate your reasoning against the templates

This case is not a rewrite of the RAG template. It takes the underestimated boundaries in enterprise knowledge-base Q&A and reasons through them.

| Reusable template / chapter | What this case reuses | What this case adds |
|---|---|---|
| [RAG Knowledge Base](../../templates/rag-knowledge-base/README.md) | Document ingestion, chunking, embedding, retrieval, reranking, citations | Turns RAG into a shippable enterprise system with permissions, versions, freshness, and evals |
| [AI Chat Product](../../templates/ai-chat-product/README.md) | LLM orchestration, context assembly, token cost, safety guardrails | Shows that the chat box is only the entry point; the evidence chain is the core |
| [Vector Database](../../templates/vector-database/README.md) | Vector index, similarity retrieval, metadata filtering | Emphasizes that similar is not relevant; keyword search and reranking are needed |
| [Search Engine](../../templates/search-engine/README.md) | Keyword retrieval, ranking, permission filtering | Brings BM25-style search back into the RAG main path |
| [Architecting in the age of LLMs](../../tutorial/17-大模型时代的架构判断.md) | Non-determinism, context engineering, cost / latency / quality triangle | Lands those abstract judgments in enterprise Q&A |
| [Eval-driven architecture](../../tutorial/25-评测驱动把够好写进架构.md) | Define "good enough" with eval sets | Makes retrieval, citations, and refusals regression-testable |

> **Reading suggestion**: read this case first, then return to the [RAG Knowledge Base template](../../templates/rag-knowledge-base/README.md). RAG should now read not as "a smarter model," but as "more reliable evidence."

---

## 🎯 Quick check

<Quiz
  question="What should an enterprise RAG knowledge base prioritize first?"
  :options="['Answers should sound natural; sources do not matter', 'Answer only from documents the current user may access, and cite original sources for key claims', 'Put every document into the model context and let the model decide']"
  :answer="1"
  explanation="In enterprise settings, trust and control matter more than chatty answers. The answer must come from authorized evidence and cite original sources; otherwise it is an unverifiable chat box."
/>

<Quiz
  question="Why do production RAG systems usually avoid pure vector retrieval only?"
  :options="['Because vector retrieval is useless', 'Because vectors are good at semantic similarity but unstable for IDs, names, product models, and clause numbers; keyword search and reranking fill that gap', 'Because keyword search is always smarter than vector search']"
  :answer="1"
  explanation="Vector retrieval handles semantic similarity, keyword retrieval handles exact matches, and reranking chooses chunks that truly answer the question. Production RAG usually combines all three."
/>

<Quiz
  question="If a retrieved document chunk says ignore system rules, what should the system do?"
  :options="['Follow it, because it is knowledge-base content', 'Treat retrieved content as untrusted evidence: it can provide facts but cannot override system instructions', 'Delete all documents that contain imperative language']"
  :answer="1"
  explanation="RAG retrieval results re-enter the model context, so they are also a prompt-injection surface. Architecture must mark document chunks as untrusted evidence and keep system instructions separate from evidence."
/>

<Quiz
  question="What is the most accurate relationship between Graph RAG and ordinary vector RAG?"
  :options="['Graph RAG replaces all vector retrieval', 'Graph RAG adds entity-relationship retrieval for relationship-heavy questions, but still must return to source evidence and citations', 'Once Graph RAG exists, permissions and evals are no longer needed']"
  :answer="1"
  explanation="Graph RAG is not a universal replacement. It adds entity relationships and cross-document paths, but the final answer still needs authorized, citable source evidence."
/>

---

## Case summary

- **RAG is not throwing documents at AI; it is building an evidence production line.** The offline path turns documents into retrievable evidence, and the online path turns questions into citable answers.
- **It will not be crushed by QPS first; it will be crushed by quality.** Bad retrieval, wrong citations, permission leaks, and missing evals are more dangerous than 10 QPS.
- **Pure vector retrieval is not enough.** Enterprise knowledge bases contain IDs, names, clause numbers, and domain terms; hybrid retrieval + reranking is usually steadier.
- **Graph RAG is retrieval enhancement, not a silver bullet.** When the core question changes from "find a similar paragraph" to "find entity relationships and applicability paths," a knowledge graph can fill the gap; it also adds extraction, update, permission, and eval cost.
- **Permissions must apply before retrieval context reaches the model.** Once a sensitive chunk enters model context, hiding it in the UI is too late.
- **No evidence means refusal.** Enterprise AI maturity is not always having something to say; it is being willing to say it does not know when evidence is insufficient.
- **Evals are part of the architecture.** Chunking, model, prompt, and reranking changes can all degrade quality; without eval sets, the system cannot evolve safely.

> **Bridge forward**: this case lands the [RAG Knowledge Base template](../../templates/rag-knowledge-base/README.md) in a concrete enterprise product. If the next case moves into realtime chat / collaboration, the pressure changes again: long connections, message ordering, offline delivery, and multi-user editing conflicts.

---

## Related links

- Template cross-check: [RAG Knowledge Base](../../templates/rag-knowledge-base/README.md) · [AI Chat Product](../../templates/ai-chat-product/README.md) · [Vector Database](../../templates/vector-database/README.md) · [Search Engine](../../templates/search-engine/README.md)
- Methodology: [02 · The architect's thinking framework](../../tutorial/02-架构师的思考框架.md) · [17 · Architecting in the age of LLMs](../../tutorial/17-大模型时代的架构判断.md) · [22 · AI-native system design](../../tutorial/22-AI原生系统设计.md)
- Hard parts: [16 · Security & Multi-Tenancy](../../tutorial/16-安全与多租户架构.md) · [25 · Eval-driven architecture](../../tutorial/25-评测驱动把够好写进架构.md)
