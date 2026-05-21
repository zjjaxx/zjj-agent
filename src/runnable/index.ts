import {
  type Runnable,
  RunnableLambda,
  RunnableSequence,
  RunnableBranch,
  RunnablePassthrough,
} from "@langchain/core/runnables";
import { ToolMessage, AIMessage } from "@langchain/core/messages";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { errorLog, infoLog, successLog } from "../utils/color";
import type { BaseMessage } from "@langchain/core/messages";

export type State={
  response?: AIMessage;
  messages: BaseMessage[];
  tools: DynamicStructuredTool[];
  toolMessages?: ToolMessage[];
  done: boolean;
}
const toolExecutor = new RunnableLambda({
  func: async (input: {
    response: AIMessage;
    tools: DynamicStructuredTool[];
  }) => {
    const { response, tools } = input;

    return Promise.all(
      response?.tool_calls?.map(async (toolCall) => {
        const foundTool = tools.find((t) => t.name === toolCall.name);
        if (!foundTool) {
          const msg = `工具: ${toolCall.name} 不存在`;
          errorLog(msg);
          return new ToolMessage({
            tool_call_id: toolCall.id ?? "",
            content: msg,
          });
        }
        infoLog(
          `🚀执行工具: ${toolCall.name},参数: ${JSON.stringify(toolCall.args)}`,
        );
        try {
          const toolResult = await foundTool.invoke(toolCall);
          successLog(`工具: ${toolCall.name} 执行成功, 结果:`,toolResult);
          return toolResult;
        } catch (error) {
          const msg = `执行工具: ${toolCall.name},参数: ${JSON.stringify(toolCall.args)}失败: ${error instanceof Error ? error.message : String(error)}`;
          errorLog(msg);
          return new ToolMessage({
            tool_call_id: toolCall.id ?? "",
            content: msg,
          });
        }
      }) ?? [],
    );
  },
});
// 2. 对结果的处理
const genereateAgentStepChain = (llmChain:Runnable) => RunnableSequence.from([
  // step1: 将 LLM 输出挂到 state.response 上
  RunnablePassthrough.assign({
    response: llmChain,
  }), // step2: 使用 RunnableBranch 根据是否有 tool_calls 走不同分支
  RunnableBranch.from([
    // 分支1：没有 tool_calls，认为本轮已经完成
    [
      (state: State) =>
        !state.response?.tool_calls || state.response.tool_calls.length === 0,
      new RunnableLambda({
        func: async (state: State) => {
          const { messages, response } = state;
          const newMessages = [...messages, response ?? new AIMessage({content: ""})];
          infoLog(`🔍 任务完成，返回结果: ${response?.content ?? ""}`);
          return {
            ...state,
            messages: newMessages,
            done: true,
          };
        },
      }),
    ], // 默认分支：有 tool_calls，调用工具并把 ToolMessage 写回 messages
    RunnableSequence.from([
      new RunnableLambda({
        func: async (state: State) => {
          const { messages, response } = state;
          const newMessages = [...messages, response];

          infoLog(
            `🔍 检测到 ${response?.tool_calls?.length ?? 0} 个工具调用`,
          );

          return {
            ...state,
            messages: newMessages,
          };
        },
      }), // 调用工具执行器，得到 toolMessages
      RunnablePassthrough.assign({
        toolMessages: toolExecutor,
      }),
      new RunnableLambda({
        func: async (state: State) => {
          const { messages, toolMessages } = state;
          return {
            ...state,
            messages: [...messages, ...(toolMessages ?? [])],
            done: false,
          };
        },
      }),
    ]),
  ]),
]);

export { toolExecutor, genereateAgentStepChain };
