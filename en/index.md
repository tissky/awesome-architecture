---
layout: home

hero:
  name: "Awesome Architecture"
  text: "Think like an architect"
  tagline: "Writing code is disappearing; judgment is what's getting valuable. 26 chapters on architectural thinking (foundations + advanced + practice + AI-collab, all complete) + 25 architecture maps of real systems — architecture only, no syntax."
  actions:
    - theme: brand
      text: Start the tutorial →
      link: /en/tutorial/README
    - theme: alt
      text: Browse in 中文
      link: /
    - theme: alt
      text: GitHub
      link: https://github.com/study8677/awesome-architecture

features:
  - icon: 🧠
    title: Judgment, not syntax
    details: No language or framework. A transferable, durable way of thinking — requirements → constraints → quality attributes → trade-offs.
  - icon: 🗺️
    title: 25 architecture maps
    details: From e-commerce, social feeds, chat and video to AI gateways, RAG and inference serving — each explains why it's built that way and where it breaks.
  - icon: ⚖️
    title: Decisions & trade-offs first
    details: Every template lists the real forks in the road, what was given up, and the first bottleneck at scale.
  - icon: 🔗
    title: Real prototypes
    details: Each template links to real open-source projects and engineering papers (vLLM, LiteLLM, TigerBeetle, Uber H3, Figma…).
---

> ✅ **Fully bilingual.** All 26 tutorial chapters and 25 templates are available in English — use the language switch (top-right) or browse `en/` in the repo. [Contributions welcome](https://github.com/study8677/awesome-architecture).

## 🗺️ Browse all 25 architecture maps

Click a category to filter, then click any card to jump to that template's architecture map.

<ArchExplorer />

## ⚖️ Architecture is a series of forks in the road

The most valuable section of every template is "Key Decisions & Trade-offs." Try this interactive starter:

<DecisionCard
  title="Monolith or Microservices?"
  a="Monolith"
  aDesc="One deployable unit, in-process function calls. Simple, debuggable, light on ops."
  b="Microservices"
  bDesc="Multiple independently deployed services calling each other over the network. Independent scaling and release, but you inherit the full burden of distributed systems."
  verdict="Default to a 'modular monolith' first. Microservices first solve a *people* scaling problem (multiple teams blocking each other in one codebase), not a *machine* performance problem — splitting prematurely, without the org size, independent-deployment need, and platform muscle in place, is self-inflicted pain."
/>

## 🤔 First, a warm-up

Before diving in, check your gut sense of 'architecture':

<Quiz
  question="Which of the following is closest to the essence of 'architecture'?"
  :options="['A diagram with a few boxes connected by lines', 'A set of decisions that are hard to change, cross-cutting, and decide quality attributes', 'Just use the newest frameworks and microservices']"
  :answer="1"
  explanation="Architecture = the decisions that, once made, are hard to change, affect the whole system, and decide whether it is *good*. Diagrams are how decisions get expressed; the *why* behind decisions is the soul."
/>

Ready? 👉 [Start from Chapter 01](/en/tutorial/01-为什么先有架构思维), or browse [25 architecture maps](https://github.com/study8677/awesome-architecture/tree/main/en/templates) on GitHub.
