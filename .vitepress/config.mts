import { defineConfig } from 'vitepress'

// ---- 中文侧边栏 ----
const zhTutorial = [
  { text: '教程总览', link: '/tutorial/README' },
  { text: '01 · 为什么先有架构思维', link: '/tutorial/01-为什么先有架构思维' },
  { text: '02 · 架构师的思考框架', link: '/tutorial/02-架构师的思考框架' },
  { text: '03 · 读懂与画好架构图', link: '/tutorial/03-读懂与画好架构图' },
  { text: '04 · 十大核心架构模式', link: '/tutorial/04-十大核心架构模式' },
  { text: '05 · 数据与状态', link: '/tutorial/05-数据与状态' },
  { text: '06 · 质量属性与取舍', link: '/tutorial/06-质量属性与取舍' },
  { text: '07 · 从 0 到 1 设计一个系统', link: '/tutorial/07-从0到1设计一个系统' },
  { text: '08 · 架构决策记录与演进', link: '/tutorial/08-架构决策记录与演进' },
  { text: '09 · 架构品味', link: '/tutorial/09-架构品味' },
  { text: '附录 · 架构术语表', link: '/tutorial/术语表' },
  { text: '附录 · 何时升级架构(触发信号)', link: '/tutorial/演进触发信号' },
]

const zhCommon = [
  { text: 'AI 对话产品', link: '/templates/ai-chat-product/README' },
  { text: '浏览器插件', link: '/templates/browser-extension/README' },
  { text: '普通网站', link: '/templates/standard-web-app/README' },
  { text: '移动 App', link: '/templates/mobile-app/README' },
  { text: '电商平台', link: '/templates/ecommerce-platform/README' },
  { text: '社交信息流', link: '/templates/social-feed/README' },
  { text: '视频流媒体', link: '/templates/video-streaming/README' },
  { text: '实时通讯', link: '/templates/realtime-chat/README' },
  { text: '短链接服务', link: '/templates/url-shortener/README' },
  { text: '支付系统', link: '/templates/payment-system/README' },
  { text: '搜索引擎', link: '/templates/search-engine/README' },
  { text: '网约车 / 出行', link: '/templates/ride-hailing/README' },
  { text: '实时协同文档', link: '/templates/collaborative-doc/README' },
  { text: '云存储 / 网盘', link: '/templates/cloud-storage/README' },
  { text: '通知 / 推送系统', link: '/templates/notification-system/README' },
  { text: '在线票务 / 抢票', link: '/templates/online-ticketing/README' },
]

const zhAI = [
  { text: 'AI 中转站 / 网关', link: '/templates/ai-gateway/README' },
  { text: 'RAG 知识库', link: '/templates/rag-knowledge-base/README' },
  { text: 'AI Agent / 工作流', link: '/templates/ai-agent-platform/README' },
  { text: '模型推理服务', link: '/templates/inference-serving/README' },
  { text: '向量数据库', link: '/templates/vector-database/README' },
]

export default defineConfig({
  title: 'Awesome Architecture',
  description: '专注「架构思维」的中文知识库:8 章教程 + 21 张真实系统架构地图。',
  lang: 'zh-Hans',
  base: process.env.GITHUB_PAGES ? '/awesome-architecture/' : '/',
  cleanUrls: true,
  ignoreDeadLinks: false,
  lastUpdated: true,
  srcExclude: [],
  head: [
    ['meta', { name: 'theme-color', content: '#3c8772' }],
    ['meta', { property: 'og:title', content: 'Awesome Architecture · 架构图谱' }],
    ['meta', { property: 'og:description', content: '像架构师一样思考:8 章教程 + 21 张真实系统架构地图。' }],
  ],

  themeConfig: {
    search: { provider: 'local' },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/study8677/awesome-architecture' },
    ],
  },

  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-Hans',
      themeConfig: {
        nav: [
          { text: '首页', link: '/' },
          { text: '教程', link: '/tutorial/README' },
          { text: '架构模板', link: '/templates/README' },
        ],
        sidebar: {
          '/tutorial/': [{ text: '📚 教程', items: zhTutorial }],
          '/templates/': [
            { text: '🗺️ 经典 / 通用系统', items: zhCommon },
            { text: '🤖 AI 原生系统', items: zhAI },
          ],
          '/': [
            { text: '📚 教程', collapsed: false, items: zhTutorial },
            { text: '🗺️ 经典 / 通用系统', collapsed: true, items: zhCommon },
            { text: '🤖 AI 原生系统', collapsed: true, items: zhAI },
          ],
        },
        outline: { label: '本页大纲', level: [2, 3] },
        docFooter: { prev: '上一篇', next: '下一篇' },
        darkModeSwitchLabel: '外观',
        lightModeSwitchTitle: '切换到浅色模式',
        darkModeSwitchTitle: '切换到深色模式',
        sidebarMenuLabel: '菜单',
        returnToTopLabel: '回到顶部',
        langMenuLabel: '切换语言',
        lastUpdatedText: '最后更新',
      },
    },

    en: {
      label: 'English',
      lang: 'en',
      link: '/en/',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/en/' },
          { text: 'Tutorial', link: '/en/tutorial/README' },
          { text: 'GitHub', link: 'https://github.com/study8677/awesome-architecture' },
        ],
        sidebar: {
          '/en/': [
            {
              text: '📚 Tutorial',
              items: [
                { text: 'Overview', link: '/en/tutorial/README' },
                { text: '01 · Why architecture comes first', link: '/en/tutorial/01-为什么先有架构思维' },
                { text: "02 · The architect's thinking framework", link: '/en/tutorial/02-架构师的思考框架' },
                { text: '03 · Reading & drawing diagrams', link: '/en/tutorial/03-读懂与画好架构图' },
                { text: '04 · Ten core patterns', link: '/en/tutorial/04-十大核心架构模式' },
                { text: '05 · Data & state', link: '/en/tutorial/05-数据与状态' },
                { text: '06 · Quality attributes & trade-offs', link: '/en/tutorial/06-质量属性与取舍' },
                { text: '07 · Designing from 0 to 1', link: '/en/tutorial/07-从0到1设计一个系统' },
                { text: '08 · ADRs & evolution', link: '/en/tutorial/08-架构决策记录与演进' },
                { text: '09 · Architectural taste', link: '/en/tutorial/09-架构品味' },
              ],
            },
          ],
        },
        outline: { label: 'On this page', level: [2, 3] },
        docFooter: { prev: 'Previous', next: 'Next' },
        returnToTopLabel: 'Back to top',
        langMenuLabel: 'Change language',
      },
    },
  },
})
