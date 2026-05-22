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
import {runnablePrompt} from "./prompt";
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
      tools: tools as DynamicStructuredTool[],
      question: query,
      k: 5,
      rag,
    };
    const agentStepChain = genereateAgentStepChain(llmChain);
    while (true) {
      const progress = createProgress(`🚀请求模型中...`);
      const stream = await agentStepChain.stream(state);
      let acc: any
      for await (const chunk of stream) {
        acc = acc ? acc.concat(chunk) : chunk;
        process.stdout.write(typeof chunk.response?.content === "string" ? chunk.response?.content : JSON.stringify(chunk.response?.content));
      }
      progress.succeed(`模型请求完成`);
      state=acc;
      if(state.done) {
        return state;
      }
    }
  }
  const rag = new RAG();
  await rag.connnectMilvus()
  await rag.initMilvus()
  const llmChain = runnablePrompt.pipe(modelWithTools);
  const questions =[ "段誉喜欢乔峰吗？","杭州市余杭区欧美金融城附近的5个酒店，以及去的路线，路线规划生成文档保存到/Users/zhengjiajun/Desktop/路线规划.md 文件"];
  for await (const question of questions) {
    const aiMsg = await runAgentLoop(question);
    successLog(`AI响应内容`,aiMsg.response?.content);
  }
  await mcpClient.close();
}
main();
