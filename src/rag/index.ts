import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import {withSpinner} from "../utils/progress"
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { infoLog } from "../utils/color";
export const generateRagModel = () => {
  const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.EMBEDDINGS_MODEL_KEY,
    model: process.env.EMBEDDINGS_MODEL_NAME,
    batchSize: 10,
    configuration: {
      baseURL: process.env.EMBEDDINGS_MODEL_BASE_URL,
    },
  });
  return embeddings;
};
export const generateVectorStore = async (embeddings: OpenAIEmbeddings,webDocs:Document[]) => {
  const vectorStore = withSpinner("🚀生成向量存储中...", async () => await MemoryVectorStore.fromDocuments(
    webDocs,
    embeddings,
  ));
  return vectorStore;
};

export const executeRag = async (question: string,webDocs:Document[]) => {
  const embeddings = generateRagModel();
  const vectorStore = await generateVectorStore(embeddings,webDocs);
  const retriever = vectorStore.asRetriever({ k: 3 });
  const retrievedDocs = await withSpinner("🚀RAG检索文档中...", async () => await retriever.invoke(question));
  // 构建 prompt
  const context = retrievedDocs
    .map((doc, i) => `[片段${i + 1}]\n${doc.pageContent}`)
    .join("\n\n━━━━━\n\n");
  const prompt = `基于以下文档回答问题。
文档:
${context}`;
  infoLog(`RAG prompt: ${prompt}`);
  return prompt;
};
