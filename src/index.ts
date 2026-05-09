import { resolve } from "path";
import { homedir } from "os";
import dotenv from "dotenv";
import { mkdirSync } from "fs";
import { errorLog, infoLog, gradientBanner, successLog } from "./utils/color";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage, ToolCall } from "@langchain/core/messages";
import {
  execaTool,
  readFileTool,
  writeFileTool,
  listDirectoryTool,
} from "./utils/tool";
import { ChatDeepSeekWithReasoning } from "./chat-deepseek-with-reasoning";
import { withProgressBar, withSpinner } from "./utils/progress";

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

const tools = [execaTool, readFileTool, writeFileTool, listDirectoryTool];

async function invokeToolCall(toolCall: ToolCall) {
  switch (toolCall.name) {
    case "execa":
      return execaTool.invoke(toolCall);
    case "readFile":
      return readFileTool.invoke(toolCall);
    case "writeFile":
      return writeFileTool.invoke(toolCall);
    case "listDirectory":
      return listDirectoryTool.invoke(toolCall);
    default:
      errorLog(`工具: ${toolCall.name} 不存在`);
      return undefined;
  }
}

async function invokeToolCalls(toolCalls: ToolCall[]) {
  return withProgressBar("🚀执行工具", toolCalls.length, (tick) =>
    Promise.all(
      toolCalls.map(async (toolCall) => {
        try {
          return await invokeToolCall(toolCall);
        } finally {
          tick();
        }
      }),
    ),
  );
}

const llm = new ChatDeepSeekWithReasoning({
  model: "deepseek-v4-pro",
  temperature: 0,
  apiKey: DEEPSEEK_API_KEY,
});
const modelWithTools = llm.bindTools(tools);
const messages: BaseMessage[] = [
  new SystemMessage(`你是一个项目管理助手，使用工具完成任务。
当前工作目录: ${process.cwd()}
可用工具：
- execa: 执行脚本（使用此工具来执行脚本）
- readFile: 读取文件（使用此工具来读取文件）
- writeFile: 写入文件（使用此工具来写入文件）
- listDirectory: 列出目录（使用此工具来列出目录）`),
  new HumanMessage(`在当前目录下创建一个功能丰富的 React TodoList 应用：

1. 创建项目：基于vite+react+Tanstack+shadcn+tailwindcss 的技术栈创建一个TodoList应用
2. 完整功能的 TodoList：
 - 添加、删除、编辑、标记完成
 - 分类筛选（全部/进行中/已完成）
 - 统计信息显示
 - localStorage 数据持久化
3. 添加复杂样式：
 - 渐变背景（蓝到紫）
 - 卡片阴影、圆角
 - 悬停效果
4. 添加动画：
 - 添加/删除时的过渡动画
 - 使用 CSS transitions
5. 列出目录确认

注意：使用 pnpm，功能要完整，样式要美观，要有动画效果

之后在 项目中：
1. 使用 pnpm install 安装依赖
2. 使用 pnpm run dev 启动服务器
`),
];
let aiMsg = await withSpinner("🚀请求模型中...", () =>
  modelWithTools.invoke(messages),
);
successLog(`AI: ${aiMsg.content}`);
messages.push(aiMsg);
while (aiMsg?.tool_calls && aiMsg.tool_calls.length > 0) {
  const toolResults = await invokeToolCalls(aiMsg.tool_calls);
  toolResults.forEach((toolResult) => {
    if (toolResult) {
      messages.push(toolResult);
    }
  });
  aiMsg = await withSpinner("🚀请求模型中...", () =>
    modelWithTools.invoke(messages),
  );
  successLog(`AI: ${aiMsg.content}`);
  messages.push(aiMsg);
}
