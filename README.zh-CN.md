# Awesome Architecture · 架构图谱

> 一个专注「**架构**」而非「代码」的开源知识库。
> 收集真实热门系统的架构模板,并配一套让你成为更好架构师的教程。

[English](./README.md) · **简体中文**

---

## 这个仓库为什么存在

过去二十年,程序员的核心竞争力是「**把代码写对、写快**」。

但有一件事正在发生:**写代码本身正在变得越来越廉价**。AI 可以生成函数、补全样板、翻译语言、修复语法。一个具体的实现细节——用 `for` 还是 `map`、用 Postgres 还是 MySQL 的某个语法——正在快速贬值。

真正不会贬值、而且越来越值钱的,是另一种能力:

> **在动手写第一行代码之前,先想清楚这个系统应该长什么样子。**
>
> 数据从哪来、到哪去?哪些部分必须强一致、哪些可以最终一致?
> 哪里会先崩?用户从 1 万涨到 1 亿时,第一个瓶颈在哪?
> 为了拿到 A,我愿意放弃哪个 B?

这就是**架构思维**。它和具体语言无关,和框架无关,甚至和今年流行什么无关。它是一种「**先看地图,再上路**」的判断力。

**本仓库的信念:未来优秀的开发者,首先是一个会做架构判断的人,其次才是会写代码的人。** 你应该先在架构层面对自己要做的东西有清晰的理解,代码只是把这个理解落地的手段之一。

---

## 仓库里有什么

```
awesome-architecture/
├── tutorial/      📚 教程 —— 系统地教你「怎么像架构师一样思考」
└── templates/     🗺️ 模板 —— 真实热门系统的架构地图,只讲架构、不讲语法
```

### 📚 tutorial/ —— 成为更好架构师的教程

不是讲「某个框架怎么用」,而是讲一套可迁移的思考方法:如何把模糊的需求拆成约束,如何在取舍中做决策,如何画出能沟通的架构图,如何从 0 设计一个全新系统。

| 章节 | 主题 | 你将学会 |
|---|---|---|
| [01](tutorial/01-为什么先有架构思维.md) | 为什么先有架构思维 | 为什么「架构优先」是这个时代的核心技能 |
| [02](tutorial/02-架构师的思考框架.md) | 架构师的思考框架 | 需求 → 约束 → 质量属性 → 取舍 的通用流程 |
| [03](tutorial/03-读懂与画好架构图.md) | 读懂与画好架构图 | 用 C4 模型把脑中的系统画出来、讲明白 |
| [04](tutorial/04-十大核心架构模式.md) | 十大核心架构模式 | 分层、微服务、事件驱动、CQRS… 各自解决什么问题 |
| [05](tutorial/05-数据与状态.md) | 数据与状态 | 为什么「数据」才是系统真正的难点 |
| [06](tutorial/06-质量属性与取舍.md) | 质量属性与取舍 | 性能/可用性/一致性/成本,怎么权衡 |
| [07](tutorial/07-从0到1设计一个系统.md) | 从 0 到 1 设计一个系统 | 一套可照着做的实战方法论 |
| [08](tutorial/08-架构决策记录与演进.md) | 架构决策记录与演进 | 用 ADR 记录决策,让架构随业务长大 |

> 👉 **新手从 [tutorial/README.md](tutorial/README.md) 开始**,那里有完整的学习路径。

### 🗺️ templates/ —— 真实系统的架构模板

每一个模板都是一张「架构地图」。我们**刻意不讨论用什么语言、什么框架**,只讨论:这类系统在解决什么问题、由哪些部件组成、数据怎么流动、关键决策怎么取舍、规模化时会死在哪里。

> 目前共 **21** 个模板(16 经典 / 通用 + 5 AI 原生),每个都在末尾附**真实开源项目 / 工程文档链接**,可顺着去读源码。

**经典 / 通用系统:**

| 模板 | 代表产品 | 核心架构看点 |
|---|---|---|
| [AI 对话产品](templates/ai-chat-product/README.md) | Claude、ChatGPT | LLM 推理、流式输出、上下文管理、RAG、成本控制 |
| [浏览器插件](templates/browser-extension/README.md) | Honey、Grammarly | 内容脚本/后台分离、页面注入、隐私边界、变现 |
| [普通网站](templates/standard-web-app/README.md) | 企业官网、博客、SaaS 后台 | 经典三层、缓存、读写分离的「够用就好」 |
| [移动 App](templates/mobile-app/README.md) | 大多数 iOS/Android 应用 | 离线优先、数据同步、客户端状态、推送 |
| [电商平台](templates/ecommerce-platform/README.md) | Amazon、Shopify、淘宝 | 库存、订单、支付、超卖、大促洪峰 |
| [社交信息流](templates/social-feed/README.md) | Twitter/X、Instagram | Feed 拉取/推送、关注关系、热点扩散 |
| [视频流媒体](templates/video-streaming/README.md) | Netflix、YouTube | 转码、CDN、自适应码率、推荐 |
| [实时通讯](templates/realtime-chat/README.md) | WhatsApp、Slack、微信 | 长连接、消息时序、离线投递、群扩散 |
| [短链接服务](templates/url-shortener/README.md) | Bitly、TinyURL、t.co | 读多写少、缓存、301/302、分布式唯一 ID |
| [支付系统](templates/payment-system/README.md) | Stripe、支付宝、PayPal | 幂等、复式记账、对账、状态机 |
| [搜索引擎](templates/search-engine/README.md) | Google、Elasticsearch | 倒排索引、相关性排序、召回+精排、分片 |
| [网约车 / 出行](templates/ride-hailing/README.md) | Uber、滴滴 | 地理空间索引、实时位置、供需匹配、动态定价 |
| [实时协同文档](templates/collaborative-doc/README.md) | Google Docs、Figma | OT/CRDT、单 writer 串行、操作日志、离线同步 |
| [云存储 / 网盘](templates/cloud-storage/README.md) | Dropbox、iCloud | 文件分块、内容寻址去重、增量同步、断点续传 |
| [通知 / 推送系统](templates/notification-system/README.md) | Novu、FCM/APNs | 多渠道扇出、去重限频、异步重试、优先级 |
| [在线票务 / 抢票](templates/online-ticketing/README.md) | Ticketmaster、大麦、12306 | 虚拟等候室、原子扣减防超卖、锁座超时 |

**🤖 AI 原生系统(LLM 时代新增):**

| 模板 | 代表产品 / 原型 | 核心架构看点 |
|---|---|---|
| [AI 中转站 / 网关](templates/ai-gateway/README.md) | One API、LiteLLM、Portkey | 统一接口、计费限流、负载均衡、故障转移、缓存 |
| [RAG 知识库](templates/rag-knowledge-base/README.md) | RAGFlow、LlamaIndex、Dify | 切块、向量检索、混合检索+重排、引用溯源 |
| [AI Agent / 工作流](templates/ai-agent-platform/README.md) | Dify、Coze、LangGraph | 行动循环、工具沙箱、记忆、可控兜底 |
| [模型推理服务](templates/inference-serving/README.md) | vLLM、SGLang、Triton | 连续批处理、分页 KV 缓存、量化、多副本 |
| [向量数据库](templates/vector-database/README.md) | Milvus、Qdrant、pgvector | ANN 近似最近邻、HNSW/IVF、召回-延迟权衡 |

> 👉 **想加入自己的模板?** 套用 [templates/_TEMPLATE.md](templates/_TEMPLATE.md) 的统一格式即可。

---

## 怎么用这个仓库

**如果你是初学者 / 想转向架构思维:**
按顺序读完 `tutorial/`,每读完一章,就去 `templates/` 里挑一个你感兴趣的系统,试着用刚学的框架去「读懂」它。

**如果你正要设计一个新系统:**
先去 `tutorial/07` 学方法论,再去 `templates/` 里找最接近你场景的那张地图,把它当作起点而不是答案——照着它的「关键决策」和「常见误区」逐条问自己。

**如果你在准备系统设计面试:**
`templates/` 里的每个模板都覆盖了高频考点(超卖、Feed 扩散、消息时序、流式输出…),按统一格式组织,适合系统性复习。

**如果你是资深工程师 / 架构师:**
直接看每个模板的「关键决策与权衡」和「演进路线」,这是最浓缩的部分。欢迎贡献你踩过的坑。

---

## 三条阅读原则

1. **先问「为什么」,再看「怎么做」。** 任何一个架构选择,背后都是某个约束或某个取舍。看不到取舍,就等于没看懂。
2. **没有最好的架构,只有最合适的架构。** 同样是「聊天」,做一个内部工具和做微信,答案天差地别。规模、团队、成本、合规决定一切。
3. **架构是会长大的。** 不要拿成熟期的架构去套 MVP。每个模板都给了「演进路线」,告诉你什么时候该升级、什么时候过度设计。

---

## 一句话总结

> **代码告诉计算机要做什么;架构决定这件事到底值不值得做、能不能做成、扛不扛得住。**
> 这个仓库,帮你练后面那种判断力。
