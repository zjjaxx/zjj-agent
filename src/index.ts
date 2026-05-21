import { resolve } from "path";
import { homedir } from "os";
import dotenv from "dotenv";
import { mkdirSync } from "fs";
import { errorLog, infoLog, gradientBanner, successLog } from "./utils/color";
import { HumanMessage } from "@langchain/core/messages";
import { execaTool, personTool } from "./utils/tool";
import { RAG } from "./rag/index";
import { getTools, generateMcpClient } from "./mcp/test-client";
import { ChatDeepSeekWithReasoning } from "./chat-deepseek-with-reasoning";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { genereateAgentStepChain,type State } from "./runnable";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { createProgress } from "./utils/progress";


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
  const tools = [execaTool, personTool, ...mcpTools];
  successLog(`已加载工具:\n ${tools.map((tool) => tool.name).join("\n")}`);
  const llm = new ChatDeepSeekWithReasoning({
    model: "deepseek-v4-pro",
    temperature: 0.8,
    apiKey: DEEPSEEK_API_KEY,
  });
  // 1. 绑定工具并挂载解析器
  const modelWithTools = llm.bindTools(tools);

  async function runAgentLoop(query: string) {
    let state: State={
      messages: [new HumanMessage(query)],
      done: false,
      tools: tools as DynamicStructuredTool[]
    };
    const agentStepChain = genereateAgentStepChain(llmChain);
    while (true) {
      const progress = createProgress(`🔍 执行第 ${state.messages.length} 轮`);
      const result = await agentStepChain.invoke(state);
      progress.succeed(`执行第 ${state.messages.length} 轮完成`);
      if(result.done) {
        return result;
      }
      state = result;
    }
  }
  const rag = new RAG();
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "你是一个可以调用 MCP 工具的智能助手。"],
    new MessagesPlaceholder("messages"),
  ]);
  const llmChain = prompt.pipe(modelWithTools);
  const aiMsg = await runAgentLoop("杭州市余杭区欧美金融城附近的5个酒店，以及去的路线，路线规划生成文档保存到/Users/zhengjiajun/Desktop/路线规划.md 文件");
  successLog(`AI响应内容: ${aiMsg}`);
  await mcpClient.close();
}
main();
