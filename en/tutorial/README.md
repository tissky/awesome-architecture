# 📚 Tutorial: Think Like an Architect

> This tutorial teaches no language and no framework.
> It teaches a transferable, **never-expiring** skill: thinking the system through *before* you write code.

---

## What problem does this tutorial solve

Plenty of people write code for years and still can't draw their own system's architecture, nor explain "why this and not that." The reason: **schools and tutorials almost all teach "implementation," and very few systematically teach "judgment."**

- Implementation ability answers: *how do I build this feature?*
- Architectural judgment answers: *what should this system look like? where will it break? what am I trading for what?*

This tutorial is the missing lesson on judgment.

---

## Learning path

The tutorial has three parts. **Reading in order is recommended**, but each chapter also stands on its own.

### Part 1 · Build the mindset (01–03) — a new way of seeing systems

| Ch. | In one line |
|---|---|
| [01 · Why architectural thinking comes first](./01-为什么先有架构思维) | In the age of AI writing code, judgment is scarcer than implementation. |
| 02 · The architect's thinking framework | Any system can be cracked open with "requirements → constraints → quality attributes → trade-offs." |
| 03 · Reading & drawing architecture diagrams | Use the C4 model to get the system out of your head and into a picture others understand. |

### Part 2 · Master the toolbox (04–06) — what cards an architect actually holds

| Ch. | In one line |
|---|---|
| 04 · Ten core architecture patterns | Layered, microservices, event-driven, CQRS… each pattern answers a specific problem. |
| 05 · Data & state | The hard part of a system isn't the logic — it's where data lives, how it stays consistent, how it scales. |
| 06 · Quality attributes & trade-offs | Performance, availability, consistency, cost — you can't have them all. |

### Part 3 · Practice & evolution (07–08) — put judgment to work

| Ch. | In one line |
|---|---|
| 07 · Designing a system from 0 to 1 | A methodology you can literally follow to produce an architecture. |
| 08 · ADRs & evolution | Record *why* you decided with ADRs, and let architecture grow with the business. |

> 🚧 Chapters 02–08 are being translated. The full text is complete in [简体中文](/tutorial/README).

---

## After finishing, you should be able to

- [ ] Take a vague requirement and ask the right questions to break it into clear constraints and quality goals.
- [ ] Hear "we want to build an X" and immediately picture several candidate architectures, each with its trade-offs.
- [ ] Draw a clear architecture diagram that product, backend, and frontend all understand.
- [ ] Look at an unfamiliar system and quickly grasp *why it's designed that way*.
- [ ] Make architecture decisions based on constraints and trade-offs — and write down the reasons.

---

## A reminder

> Architecture has no standard answers, only answers that are "more reasonable" under specific constraints.
> What this tutorial gives you isn't conclusions — it's **the ability to ask the right questions**.
> When you naturally ask of every technical choice, "why this one? what does it cost?" — you're already thinking like an architect.
