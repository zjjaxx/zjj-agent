import { resolve } from "path";
import { homedir } from "os";
import dotenv from "dotenv";
import { mkdirSync } from "fs";
import { errorLog, infoLog, gradientBanner, successLog } from "./utils/color";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage, ToolCall } from "@langchain/core/messages";
import { execaTool, personTool, type PersonInfo } from "./utils/tool";
import {
  invokeToolCalls,
  safelyInvokeModel,
  type ModelWithTools,
} from "./utils/invoke";
import { RAG } from "./rag/index";
import {
  getTools,
  generateMcpClient,
  getMcpResourceContent,
} from "./mcp/test-client";
import { ChatDeepSeekWithReasoning } from "./chat-deepseek-with-reasoning";
import {
  naiveTemplate,
  pipelinePrompt,
  chatPrompt,
  chatPromptWithHistory,
} from "./prompt/index";
import { fewShotPrompt } from "./prompt/few-prompt";
import { RunnableSequence } from"@langchain/core/runnables";

async function main() {
  gradientBanner("欢迎使用 ZJJ AGENT!");
  const path = resolve(homedir(), ".zjj-agent", ".env");
  mkdirSync(resolve(homedir(), ".zjj-agent"), { recursive: true });
  dotenv.config({ path });
  const { DEEPSEEK_API_KEY } = process.env;
  if (!DEEPSEEK_API_KEY) {
    errorLog("DEEPSEEK_API_KEY is not set");
    process.exit(1);
  }
  infoLog(`DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY}`);

  const mcpClient = generateMcpClient();
  const mcpTools = await getTools();
  const ignoreToolMap = new Map<string, boolean>([[personTool.name, true]]);
  const tools = [execaTool, personTool, ...mcpTools];
  successLog(`已加载工具:\n ${tools.map((tool) => tool.name).join("\n")}`);
  const llm = new ChatDeepSeekWithReasoning({
    model: "deepseek-v4-pro",
    temperature: 0.8,
    apiKey: DEEPSEEK_API_KEY,
  });
  // 1. 绑定工具并挂载解析器
  const modelWithTools = llm.bindTools(tools);

  async function runAgentLoop(
    modelWithTools: ModelWithTools,
    messages: BaseMessage[],
  ) {
    // await executeTruncationMemory();
    // await summarizationMemoryDemo(modelWithTools);
    let aiMsg = await safelyInvokeModel(modelWithTools, messages, true);
    messages.push(aiMsg);

    while (true) {
      const toolCalls = aiMsg?.tool_calls?.filter(
        (toolCall) => !ignoreToolMap.get(toolCall.name),
      );
      if (!toolCalls || toolCalls.length === 0) {
        break;
      }
      const _tools = tools.filter((tool) => !ignoreToolMap.get(tool.name));
      const toolResults = await invokeToolCalls(toolCalls, _tools);
      messages.push(...toolResults);
      aiMsg = await safelyInvokeModel(modelWithTools, messages);
      messages.push(aiMsg);
    }
    return aiMsg;
  }
  const rag = new RAG();
  // const question = '"光光和东东的故事中，他们是怎么成为好朋友的？"';
  // const ragPrompt = await rag.executeRag(question,documents);
  // const question2 = '如何使用cheerio加载网页？';
  // const webDocs = await generateDocs();
  // const ragPrompt2 = await rag.executeRag(question2,webDocs);
  // await rag.connnectMilvus();
  // await rag.executeMilvus();

  // const milvusQuery = `提取和结构化段誉的信息`;
  // const milvusQueryVector = await rag.embeddings.embedQuery(milvusQuery);
  // const milvusPrompt = await rag.generatePrompt(milvusQueryVector, milvusQuery);
  const mcpResourceContent = await getMcpResourceContent();
  const prompt = await naiveTemplate.format({
    company_name: "星航科技",
    team_name: "数据智能平台组",
    manager_name: "刘总",
    week_range: "2025-03-10 ~ 2025-03-16",
    team_goal: "完成用户画像服务的灰度上线，并验证核心指标是否达标。",
    dev_activities:
      "- 阿兵：完成用户画像服务的 Canary 发布与回滚脚本优化，提交 27 次，相关任务：DATA-321 / DATA-335\n" +
      "- 小李：接入埋点数据，打通埋点 → Kafka → DWD → 画像服务的全链路，提交 22 次\n" +
      "- 小赵：完善画像服务的告警与Dashboard，新增 8 个告警规则，提交 15 次\n" +
      "- 小周：配合产品输出 A/B 实验报表，支持 3 条对外汇报用数据",
  });
  const pipelineFormatted = await pipelinePrompt.formatPromptValue({
    tone: "专业、清晰、略带幽默",
    company_name: "星航科技",
    team_name: "AI 平台组",
    manager_name: "王总",
    week_range: "2025-02-03 ~ 2025-02-09",
    team_goal: "完成智能周报 Agent 的 MVP 版本，并打通 Git / Jira 数据源。",
    dev_activities:
      "- Git: 58 次提交，3 个主要分支合并\n" +
      "- Jira: 完成 12 个 Story，关闭 7 个 Bug\n" +
      "- 关键任务：完成智能周报 Pipeline 设计、实现 Prompt 拆分、接入 ExampleSelector",
    company_values: "「极致、开放、靠谱」的价值观",
  });
  const pipelineChatMessages = pipelineFormatted.toChatMessages();
  const chatMessages = await chatPrompt.formatMessages({
    tone: "专业、清晰、略带鼓励",
    company_name: "星航科技",
    team_name: "智能应用平台组",
    manager_name: "王总",
    week_range: "2025-05-05 ~ 2025-05-11",
    team_goal: "完成内部 AI 助手灰度上线，并确保核心链路稳定。",
    dev_activities:
      "- 小李：完成 AI 助手工单流转能力，对接客服系统，提交 25 次\n" +
      "- 小张：接入日志检索和知识库查询，提交 19 次\n" +
      "- 小王：完善监控、告警与埋点，新增 10 条核心告警规则\n" +
      "- 实习生小陈：补充使用文档和 FAQ，支持 3 个内部试点团队",
  });
  const historyMessages = [
    {
      role: "human",
      content: "我们团队最近在做一个内部的周报自动生成工具。",
    },
    {
      role: "ai",
      content:
        "听起来不错，可以先把数据源（Git / Jira / 运维）梳理清楚，再考虑 Prompt 模块化设计。",
    },
    {
      role: "human",
      content: "我们已经把 Prompt 拆成了「人设」「背景」「任务」「格式」四块。",
    },
    {
      role: "ai",
      content:
        "很好，接下来可以考虑把这些模块做成可复用的 PipelinePromptTemplate，方便在不同场景复用。",
    },
  ];

  const formattedMessages = await chatPromptWithHistory.formatPromptValue({
    history: historyMessages,
    current_input: "现在我们想再优化一下多人协同编辑周报的流程，有什么建议？",
  });
  const chatWithHistoryMessages = formattedMessages.toChatMessages();
// 6. 演示：给定一个较长/较复杂的需求，让 selector 自动选出合适的示例
const currentRequirement =
'我们本周在做「内部 AI 助手」项目，既有稳定性保障（处理线上问题），' +
'也有新功能上线（接入知识库、日志检索）。希望周报既能体现「把坑都兜住了」，' +
'又能展示一部分业务侧能感知到的亮点。';


const finalPrompt = await fewShotPrompt.format({
current_requirement: currentRequirement,
});
  const messages: BaseMessage[] = [
    // new SystemMessage(milvusPrompt),
    // new SystemMessage(ragPrompt),
    // new SystemMessage(ragPrompt2),
    //     new SystemMessage(`你是一个项目管理助手，使用工具完成任务。
    // 当前工作目录: ${process.cwd()}
    // ## 参考文档（用户询问相关内容时直接引用回答，无需调用工具）：
    // ${mcpResourceContent}`),
    //     new HumanMessage(`在当前目录下创建一个功能丰富的 React TodoList 应用：
    // 1. 创建项目：基于Tanstack cli 脚手架创建一个TodoListspa单页面应用,使用pnpm作为包管理器,使用react作为前端框架,使用vite作为打包框架，用tanstack 的 form 、table、router、query,UI框架用tailwindcss,规范采用eslint、提交采用husky、git规范采用commitlint
    // 2. 完整功能的 TodoList：
    //  - 添加、删除、编辑、标记完成
    //  - 分类筛选（全部/进行中/已完成）
    //  - 统计信息显示
    //  - localStorage 数据持久化
    // 3. 添加复杂样式：
    //  - 渐变背景（蓝到紫）
    //  - 卡片阴影、圆角
    //  - 悬停效果
    // 4. 添加动画：
    //  - 添加/删除时的过渡动画
    //  - 使用 CSS transitions
    // 5. 列出目录确认
    // 注意：使用 pnpm，功能要完整，样式要美观，要有动画效果
    // 之后在 项目中：
    // 1. 使用 pnpm install 安装依赖
    // `),
    // new HumanMessage(`查询用户信息，用户ID为001,查询MCP Server 的使用指南,当前在杭州市余杭区欧美经融城，搜索离我最近的商场，查看当前目录`),
    // new HumanMessage(`杭州市余杭区欧美金融城附近的5个酒店，以及去的路线，路线规划生成文档保存到/Users/zhengjiajun/Desktop/路线规划.md 文件`),
    // new HumanMessage(question),
    // new HumanMessage(question2),
    // new HumanMessage(milvusQuery),
    // ...pipelineChatMessages,
    // ...chatMessages,
    new HumanMessage(finalPrompt),
  ];
  const aiMsg = await runAgentLoop(modelWithTools, messages);
  successLog(`AI响应内容: ${aiMsg.content}`);
  await mcpClient.close();
}
main();
