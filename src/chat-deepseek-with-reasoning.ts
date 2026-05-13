import { ChatDeepSeek } from "@langchain/deepseek";
import type { OpenAIClient } from "@langchain/openai";
import { AIMessage, BaseMessage } from "@langchain/core/messages";

type ChatCompletionRequest = {
  messages?: unknown[];
};

export class ChatDeepSeekWithReasoning extends ChatDeepSeek {
  private sourceMessages: BaseMessage[] = [];

  override async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: Parameters<ChatDeepSeek["_generate"]>[2],
  ) {
    this.sourceMessages = messages;
    return super._generate(messages, options, runManager);
  }

  override completionWithRetry(
    request: OpenAIClient.Chat.ChatCompletionCreateParamsStreaming,
    requestOptions?: OpenAIClient.RequestOptions,
  ): Promise<AsyncIterable<OpenAIClient.Chat.Completions.ChatCompletionChunk>>;
  override completionWithRetry(
    request: OpenAIClient.Chat.ChatCompletionCreateParamsNonStreaming,
    requestOptions?: OpenAIClient.RequestOptions,
  ): Promise<OpenAIClient.Chat.Completions.ChatCompletion>;
  override async completionWithRetry(
    request: ChatCompletionRequest,
    requestOptions?: OpenAIClient.RequestOptions,
  ): Promise<unknown> {
    return super.completionWithRetry(
      this.withReasoningContent(request) as never,
      requestOptions,
    );
  }

  private withReasoningContent<T extends ChatCompletionRequest>(request: T): T {
    if (!Array.isArray(request.messages)) {
      return request;
    }

    let aiMessageIndex = 0;
    const aiMessages = this.sourceMessages.filter(AIMessage.isInstance);
    const messages = request.messages.map((rawMessage) => {
      const message = rawMessage as Record<string, unknown>;

      if (message.role !== "assistant") {
        return rawMessage;
      }

      const sourceMessage = aiMessages[aiMessageIndex];
      aiMessageIndex += 1;
      const reasoningContent =
        sourceMessage?.additional_kwargs.reasoning_content;

      if (typeof reasoningContent !== "string") {
        return message;
      }

      return {
        ...message,
        reasoning_content: reasoningContent,
      };
    });

    return {
      ...request,
      messages,
    };
  }
}
