import {
  AIMessage,
  AIMessageChunk,
  ToolMessage,
  type BaseMessage,
  type ToolCall,
} from "@langchain/core/messages";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import type { Runnable } from "@langchain/core/runnables";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { withSpinner } from "./progress";
import { errorLog, infoLog, infoLogStream } from "./color";
import type {
  BaseChatOpenAI,
  BaseChatOpenAICallOptions,
} from "@langchain/openai";

/** `BaseChatOpenAI.bindTools` 的参数元组：`[tools, kwargs?]` */
export type ChatOpenAIBindToolsParams = Parameters<
  BaseChatOpenAI<BaseChatOpenAICallOptions>["bindTools"]
>[0];

/** 本项目中实际可调用的工具子集（`bindTools` 允许更宽的类型联合） */
type InvokableTool = Pick<StructuredToolInterface, "name" | "invoke">;

const MODEL_REQUEST_TIMEOUT_MS = 120_000;
class ModelRequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`模型请求超过 ${Math.round(timeoutMs / 1000)} 秒仍未返回`);
    this.name = "ModelRequestTimeoutError";
  }
}

export type ModelWithTools = Runnable<BaseLanguageModelInput, AIMessageChunk>;

export async function invokeModel(
  modelWithTools: ModelWithTools,
  messages: BaseMessage[],
) {
  return await withSpinner("🚀请求模型中...", async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, MODEL_REQUEST_TIMEOUT_MS);

    try {
      const request = modelWithTools.invoke(messages, {
        signal: controller.signal,
        timeout: MODEL_REQUEST_TIMEOUT_MS,
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(new ModelRequestTimeoutError(MODEL_REQUEST_TIMEOUT_MS)),
          { once: true },
        );
      });

      return await Promise.race([request, timeoutPromise]);
    } finally {
      clearTimeout(timeout);
    }
  });
}

export async function safelyInvokeModel(
  modelWithTools: ModelWithTools,
  messages: BaseMessage[],
  stream: boolean = false,
) {
  try {
    if (stream) {
      return await streamInvokeModel(modelWithTools, messages);
    } else {
      return await invokeModel(modelWithTools, messages);
    }
  } catch (error) {
    if (error instanceof ModelRequestTimeoutError) {
      errorLog(`${error.message}，已中断本次请求，请稍后重试`);
    } else {
      errorLog(
        `模型请求失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    process.exit(1);
  }
}
export async function streamInvokeModel(
  modelWithTools: ModelWithTools,
  messages: BaseMessage[],
): Promise<AIMessage> {
  return await withSpinner("🚀请求模型中...", async (spinner) => {
    const stream = await modelWithTools.stream(messages);
    spinner.stop();
    let acc: AIMessageChunk | undefined;
    for await (const chunk of stream) {
      acc = acc ? acc.concat(chunk) : chunk;
      const reasoningContent = chunk.additional_kwargs.reasoning_content;
      if (typeof reasoningContent === "string" && reasoningContent) {
        infoLogStream(reasoningContent);
      }
      // 当前还没有解析出工具调用时，如果有文本内容就直接输出
      if (chunk.content) {
        infoLogStream( 
          typeof chunk.content === "string"
            ? chunk.content
            : JSON.stringify(chunk.content),
        );
      }

    }

    if (!acc) {
      return new AIMessage("");
    }
    return acc;
  });
}
async function invokeToolCall(
  toolCall: ToolCall,
  toolsByName: Map<string, InvokableTool>,
): Promise<ToolMessage> {
  infoLog(
    `🚀执行工具: ${toolCall.name},参数: ${JSON.stringify(toolCall.args)}`,
  );

  const tool = toolsByName.get(toolCall.name);
  if (!tool) {
    const msg = `工具: ${toolCall.name} 不存在`;
    errorLog(msg);
    return new ToolMessage({ tool_call_id: toolCall.id ?? "", content: msg });
  }

  try {
    return (await tool.invoke(toolCall)) as ToolMessage;
  } catch (error) {
    const msg = `执行工具: ${toolCall.name},参数: ${JSON.stringify(toolCall.args)}失败: ${error instanceof Error ? error.message : String(error)}`;
    errorLog(msg);
    return new ToolMessage({ tool_call_id: toolCall.id ?? "", content: msg });
  }
}

export async function invokeToolCalls(
  toolCalls: ToolCall[],
  tools: ChatOpenAIBindToolsParams,
) {
  const toolsByName = new Map<string, InvokableTool>();
  for (const t of tools) {
    const tool = t as InvokableTool;
    toolsByName.set(tool.name, tool);
  }

  return await withSpinner("🚀执行工具中...", () =>
    Promise.all(
      toolCalls.map(
        async (toolCall) => await invokeToolCall(toolCall, toolsByName),
      ),
    ),
  );
}
