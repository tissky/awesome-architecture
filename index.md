---
layout: home

hero:
  name: "Awesome Architecture"
  text: "像架构师一样思考"
  tagline: 写代码这件事正在消失,而判断力越来越值钱。26 章架构思维教程(入门 + 进阶 + 实战 + AI 协同,后两篇规划中)+ 25 张真实系统架构地图——只讲架构,不讲语法。
  actions:
    - theme: brand
      text: 开始学习 →
      link: /tutorial/README
    - theme: alt
      text: 浏览 25 个架构模板
      link: /templates/README
    - theme: alt
      text: GitHub
      link: https://github.com/study8677/awesome-architecture

features:
  - icon: 🧠
    title: 教判断,不教语法
    details: 不绑定任何语言或框架,讲一套可迁移、不会过时的思考方法:需求 → 约束 → 质量属性 → 取舍。
  - icon: 🗺️
    title: 25 张真实系统架构地图
    details: 从电商、社交信息流、IM、视频流,到 AI 网关、RAG、模型推理服务,每张都讲清「为什么这么设计、会死在哪」。
  - icon: ⚖️
    title: 决策与取舍才是核心
    details: 每个模板都列出关键岔路口、放弃了什么、规模化时第一个瓶颈在哪——这是面试和实战最值钱的部分。
  - icon: 🔗
    title: 每个模板都有真实原型
    details: 末尾附真实开源项目与工程博客 / 论文链接(vLLM、LiteLLM、TigerBeetle、Uber H3、Figma…),可顺藤摸瓜读源码。
---

## 🗺️ 浏览全部 25 个架构模板

点下方分类筛选,点任意卡片直达对应模板的「架构地图」。

<ArchExplorer />

## ⚖️ 架构,就是在岔路口做选择

每个模板里最值钱的一节,是「关键决策与权衡」。先尝尝这张可交互的决策卡:

<DecisionCard
  title="该用单体,还是微服务?"
  a="单体 Monolith"
  aDesc="一个可部署单元,模块间是函数调用。简单、好调试、运维省心。"
  b="微服务 Microservices"
  bDesc="多个独立部署的小服务,彼此网络调用。可独立扩容/发布,但引入一整座分布式复杂度的大山。"
  verdict="默认从「模块化单体」起步。微服务首先解决的是「人」的扩展性(多团队互相阻塞、谁也不敢动谁的代码),而不是「机器」的性能——在组织规模、独立部署需求、平台能力这三个前提都没满足前,贸然拆分是在给自己上刑。"
/>

## 🤔 先来热个身

正式开始前,测一下你对「架构」的理解:

<Quiz
  question="下面哪个最接近「架构」的本质?"
  :options="['画几个方框、连几根线的示意图', '一组「难以更改、影响全局、关乎质量属性」的重要决策', '尽量用最新最流行的框架和微服务']"
  :answer="1"
  explanation="架构 = 那些一旦定下就难改、会影响整个系统、并决定系统「好不好」的关键决策。画图只是把决策表达出来的形式,决策背后的「为什么」才是灵魂。"
/>

准备好了?👉 [从第 01 章开始](/tutorial/01-为什么先有架构思维),或直接挑一个上面的模板深入。
