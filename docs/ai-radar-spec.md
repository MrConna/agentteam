# AI 灵感雷达 (AI Inspiration Radar) — 项目设计说明书

本项目旨在建立一个轻量级、自动化的 AI 行业动态与灵感追踪系统。系统每天自动抓取多位 AI 领域顶级大 V 在 Twitter/X 上的最新公开动态，通过 LLM 智能去噪、翻译、分类并提炼深度灵感，最终将精美排版的 Markdown 日报自动写入用户的 Obsidian 知识库中。

---

## 1. 核心功能与业务流程

1. **多源数据抓取 (Fetch)**：
   - 输入：推特博主名单（首批：`karpathy`, `fchollet`, `sama`, `ylecun`, `swyx`）。
   - 抓取过去 24 小时内的最新推文。
   - 采用多源自适应适配器（优先采用免费免登录的 Nitter RSS 适配器，保留未来无缝切换至 RapidAPI 商业推特源的扩展接口）。

2. **智能去噪与灵感提炼 (Process)**：
   - 过滤无实质内容的日常、转推和表情符号。
   - 分类推文：*新技术/新模型、前沿观点、行业趋势、精彩 Demo*。
   - 对推文进行中英双语对照翻译，并精炼生成 **AI 灵感（Insight）**：*这对抗自身研究或侧边项目的启发是什么？*

3. **Obsidian 自动化写入与主页联动 (Publish)**：
   - 将日报自动写入本地路径：`/Users/luffy/Downloads/code/Github/my_note/无记录不过程/每日记录/AI雷达-<Date>.md`。
   - 与用户的 `🏠 主页.md` 结合，支持 Dataview 插件实时拉取并展示最近 3 天的 AI 雷达灵感快讯。

---

## 2. 系统架构设计

系统设计为模块化架构，存放在全新目录 `tools/ai-radar/` 下：

```text
tools/ai-radar/
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts               # 服务主入口
│   ├── config.ts              # 集中配置读取
│   ├── types.ts               # 数据类型定义
│   ├── sources/
│   │   ├── base.ts            # TwitterSource 基础接口
│   │   └── rss.ts             # Nitter RSS 抓取源实现
│   ├── processor.ts           # LLM 过滤与翻译引擎
│   └── obsidian.ts            # Obsidian 文件生成器与主页链接器
└── tests/
    └── radar.test.ts          # 端到端功能测试
```

### 2.1 模块说明

* **`sources/` 抽象数据源**：
  ```typescript
  export interface Tweet {
    id: string;
    username: string;
    text: string;
    url: string;
    createdAt: string;
    isRetweet: boolean;
  }
  export interface TwitterSource {
    fetchLatestTweets(username: string): Promise<Tweet[]>;
  }
  ```
  首期实现 `NitterRssSource`：利用公共 Nitter 实例（如 `nitter.net` 或其它活跃备用实例）的 RSS 地址（`https://<nitter-host>/<username>/rss`）解析推文。

* **`processor.ts` LLM 处理器**：
  调用大模型接口（支持配置 OpenAI/Gemini/DeepSeek ），通过精心设计的 Prompt，接收博主 24 小时推文集合，输出结构化的日报 JSON，最终翻译为精美的 Markdown。

* **`obsidian.ts` 主页集成**：
  在写入雷达日报的同时，检查用户的 `🏠 主页.md`，确保其中包含如下 Dataview 检索区块：
  ```markdown
  ### 📡 AI 灵感雷达（最近 3 日）
  ```dataview
  LIST FROM "无记录不过程/每日记录"
  WHERE file.name = "AI雷达-" + dateformat(file.ctime, "yyyy-MM-dd")
  SORT file.name DESC LIMIT 3
  ```
  ```

---

## 3. 开发排班与任务指派

为保证极高效率，发挥各 Session 最大生产力，我们将开发任务细分并派发给您的专属下属编队：

| 任务编号 | 任务模块 | 担当角色 (Session) | 写入范围 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| **RADAR-01** | 脚手架与 RSS 数据源开发 | **Codex (subagent-chat-019ea81d)** | `tools/ai-radar/` | 新建项目脚手架，实现 Nitter RSS 推文获取与解析逻辑，确保数据清洗干净。 |
| **RADAR-02** | LLM 处理器与 Prompt 调试 | **Claude (Pane 6:1.1)** | `tools/ai-radar/` | 设计智能去噪、双语翻译与灵感提炼的系统提示词（System Prompt），完成大模型接口对接。 |
| **RADAR-03** | Obsidian 写入与主页挂载 | **Claude (Pane 1:0.1)** | `tools/ai-radar/`, `my_note/` | 负责 Markdown 模板格式化输出、本地写入，并在用户的 `🏠 主页.md` 中挂载 Dataview 雷达面板。 |
