import { RunnableLambda } from "@langchain/core/runnables";
import type { RAG } from "../rag";
import { COLLECTION_NAME } from "../rag/novel";
import { MetricType } from "@zilliz/milvus2-sdk-node";
import { infoLog } from "../utils/color";

export const SCORE_THRESHOLD = 0.4;
export type MilvusState = {
  question: string;
  k: number;
  rag: RAG;
  searchDone?: boolean;
  milvusResults?: string;
};
export const milvusQuery = new RunnableLambda({
  func: async (input: MilvusState) => {
    const { question, rag, k, milvusResults, searchDone } = input;
    if (milvusResults || searchDone) {
      infoLog("=".repeat(50));
      infoLog(`使用缓存结果或搜索完成`);
      infoLog("=".repeat(50));
      return {
        ...input,
      };
    }
    const questionVector = await rag.embeddings.embedQuery(question);
    const searchResult = await rag.client.search({
      collection_name: COLLECTION_NAME,
      vector: questionVector,
      limit: k,
      metric_type: MetricType.COSINE,
      output_fields: ["id", "book_id", "chapter_num", "index", "content"],
    });
    searchResult.results = searchResult.results.filter(
      (item) => item.score >= SCORE_THRESHOLD,
    );
    infoLog(`Found ${searchResult.results.length} results:\n`);
    return {
      ...input,
      searchDone: true,
      milvusResults: searchResult.results
        .map(
          (item) => `[片段${item.index}]
        章节: 第 ${item.chapter_num} 章
        内容: ${item.content}`,
        )
        .join("\n\n"),
    };
  },
});
