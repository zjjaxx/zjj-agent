import { resolve } from "path";
import { homedir } from "os";
import dotenv from "dotenv";
import { mkdirSync } from "fs";
import { errorLog, infoLog, gradientBanner, successLog } from "./utils/color";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import {
  execaTool,
} from "./utils/tool";
import {
  invokeToolCalls,
  safelyInvokeModel,
  type ModelWithTools,
} from "./utils/invoke";
import { RAG } from "./rag/index";
import { generateDocs } from "./rag/loader";
import { documents } from "./rag/local";
import {
  getTools,
  getMcpResourceContent,
  generateMcpClient,
} from "./mcp/test-client";
import { ChatDeepSeek } from "@langchain/deepseek";

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
  const mcpResourceContent = await getMcpResourceContent();
  const tools = [execaTool, ...mcpTools];
  infoLog(`已加载工具:\n ${tools.map((tool) => tool.name).join("\n")}`);
  const llm = new ChatDeepSeek({
    model: "deepseek-v4-pro",
    temperature: 0.8,
    apiKey: DEEPSEEK_API_KEY,
    modelKwargs:{"thinking": {"type": "enabled"}}
  });
  const modelWithTools = llm.bindTools(tools);

  async function runAgentLoop(
    modelWithTools: ModelWithTools,
    messages: BaseMessage[],
  ) {
    let aiMsg = await safelyInvokeModel(modelWithTools, messages);
    successLog(`AI: ${aiMsg.content}`);
    messages.push(aiMsg);

    while (aiMsg?.tool_calls && aiMsg.tool_calls.length > 0) {
      const toolResults = await invokeToolCalls(aiMsg.tool_calls, tools);
      messages.push(...toolResults);

      aiMsg = await safelyInvokeModel(modelWithTools, messages);
      successLog(`AI: ${aiMsg.content}`);
      messages.push(aiMsg);
    }
  }
  const rag = new RAG();
  // const question = '"光光和东东的故事中，他们是怎么成为好朋友的？"';
  // const ragPrompt = await rag.executeRag(question,documents);
  // const question2 = '如何使用cheerio加载网页？';
  // const webDocs = await generateDocs();
  // const ragPrompt2 = await rag.executeRag(question2,webDocs);
  await rag.connnectMilvus();
  await rag.executeMilvus();
  const milvusQuery = "天龙八部的段誉喜欢乔峰吗";
  const milvusQueryVector = await rag.embeddings.embedQuery(milvusQuery);
  const milvusPrompt = await rag.generatePrompt(milvusQueryVector,milvusQuery);
  const messages: BaseMessage[] = [
    new SystemMessage(milvusPrompt),
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
    new HumanMessage(milvusQuery),
  ];
  await runAgentLoop(modelWithTools, messages);
  await mcpClient.close();
}
main();
