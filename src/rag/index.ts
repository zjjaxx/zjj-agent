import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import { withSpinner } from "../utils/progress";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { infoLog, successLog, errorLog } from "../utils/color";
import { createProgress } from "../utils/progress";
import {
  MilvusClient,
  DataType,
  MetricType,
  IndexType,
} from "@zilliz/milvus2-sdk-node";
import {
  COLLECTION_NAME,
  loadAndProcessEPubStreaming,
  BOOK_NAME,
} from "./novel";

type MilvusQueryRow = {
  id?: string | number;
};

type MilvusQueryResult = {
  data?: MilvusQueryRow[];
  results?: MilvusQueryRow[];
};

export class RAG {
  public embeddings: OpenAIEmbeddings;
  public client: MilvusClient;
  public VECTOR_DIM = 1024;
  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      apiKey: process.env.EMBEDDINGS_MODEL_KEY,
      model: process.env.EMBEDDINGS_MODEL_NAME,
      batchSize: 10,
      configuration: {
        baseURL: process.env.EMBEDDINGS_MODEL_BASE_URL,
      },
      dimensions: this.VECTOR_DIM,
    });
    this.client = new MilvusClient({
      address: process.env.MILVUS_ADDRESS ?? "localhost:19530",
    });
  }
  async generateVectorStore(webDocs: Document[]) {
    const progress=createProgress("🚀生成向量存储中...");
    const vectorStore = await MemoryVectorStore.fromDocuments(webDocs, this.embeddings);
    progress.succeed("向量存储生成完成");
    return vectorStore;
  }
  async executeRag(question: string, webDocs: Document[]) {
    const vectorStore = await this.generateVectorStore(webDocs);
    const retriever = vectorStore.asRetriever({ k: 3 });
    const retrievedDocs = await withSpinner(
      "🚀RAG检索文档中...",
      async () => await retriever.invoke(question),
    );
    const context = retrievedDocs
      .map((doc, i) => `[片段${i + 1}]\n${doc.pageContent}`)
      .join("\n\n━━━━━\n\n");
    const prompt = `基于以下文档回答问题。
文档:
${context}`;
    infoLog(`RAG prompt: ${prompt}`);
    return prompt;
  }
  async connnectMilvus() {
    infoLog("🚀连接Milvus中...");
    await this.client.connectPromise;
    successLog("🚀连接Milvus成功");
  }
  private async chunkIdExists(id: string) {
    const queryResult = (await this.client.query({
      collection_name: COLLECTION_NAME,
      expr: `id == ${JSON.stringify(id)}`,
      output_fields: ["id"],
    })) as MilvusQueryResult;
    const rows = queryResult.data ?? queryResult.results ?? [];
    return rows.length > 0;
  }
  async initMilvus() {
    // 检查集合是否存在
    const hasCollection = await this.client.hasCollection({
      collection_name: COLLECTION_NAME,
    });
    if (!hasCollection.value) {
      infoLog("创建集合中...");
      await this.client.createCollection({
        collection_name: COLLECTION_NAME,
        fields: [
          {
            name: "id",
            data_type: DataType.VarChar,
            max_length: 100,
            is_primary_key: true,
          },
          { name: "book_id", data_type: DataType.VarChar, max_length: 100 },
          { name: "book_name", data_type: DataType.VarChar, max_length: 200 },
          { name: "chapter_num", data_type: DataType.Int32 },
          { name: "index", data_type: DataType.Int32 },
          { name: "content", data_type: DataType.VarChar, max_length: 10000 },
          { name: "vector", data_type: DataType.FloatVector, dim: this.VECTOR_DIM },
        ],
      });
      successLog("集合创建成功");
      infoLog("创建索引中...");
      await this.client.createIndex({
        collection_name: COLLECTION_NAME,
        field_name: "vector",
        index_type: IndexType.IVF_FLAT,
        metric_type: MetricType.COSINE,
        params: { nlist: 1024 },
      });
      successLog("索引创建成功");
    }

    infoLog("加载集合中...");
    await this.client.loadCollection({ collection_name: COLLECTION_NAME });
    successLog("集合加载成功");
    const bookId = 1;
    await loadAndProcessEPubStreaming(
      bookId,
      async (chunks: string[], bookId: number, chapterNum: number) => {
        try {
          if (chunks.length === 0) {
            return 0;
          } // 为每个文档块生成向量并构建插入数据

          const insertData = [];
          for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const chunk = chunks[chunkIndex];
            const id = `${bookId}_${chapterNum}_${chunkIndex}`;
            if (await this.chunkIdExists(id)) {
              infoLog(`片段 ${id} 已存在`);
              continue;
            }
            const vector = await this.embeddings.embedQuery(chunk);
            insertData.push({
              id,
              book_id: bookId,
              book_name: BOOK_NAME,
              chapter_num: chapterNum,
              index: chunkIndex,
              content: chunk,
              vector,
            });
          }
          if (insertData.length > 0) {
            const insertResult = await this.client.insert({
              collection_name: COLLECTION_NAME,
              data: insertData,
            });
            if(Number(insertResult.insert_cnt) !== insertData.length) {
              errorLog(`插入章节 ${chapterNum} 的数据时出错:${insertResult.insert_cnt} !== ${insertData.length}`);
              throw new Error(`插入章节 ${chapterNum} 的数据时出错:${insertResult.insert_cnt} !== ${insertData.length}`);
            }
            return Number(insertResult.insert_cnt) || 0;
          }
          return 0;
        } catch (error) {
          errorLog(
            `插入章节 ${chapterNum} 的数据时出错:${error instanceof Error ? error.message : String(error)}`,
          );
          throw error;
        }
      },
    );
  }
  async generatePrompt(milvusQueryVector: number[], question: string) {
    const searchResult = await this.client.search({
      collection_name: COLLECTION_NAME,
      vector: milvusQueryVector,
      limit: 3,
      metric_type: MetricType.COSINE,
      output_fields: ["id", "book_id", "chapter_num", "index", "content"],
    });

    infoLog(`Found ${searchResult.results.length} results:\n`);
    searchResult.results.forEach((item, index) => {
      infoLog(`${index + 1}. [Score: ${item.score.toFixed(4)}]`);
      infoLog(`   ID: ${item.id}`);
      infoLog(`   Book ID: ${item.book_id}`);
      infoLog(`   Chapter: 第 ${item.chapter_num} 章`);
      infoLog(`   Index: ${item.index}`);
      infoLog(`   Content: ${item.content}\n`);
    });

    const context = searchResult.results
      .map((item, i) => {
        return `[片段 ${i + 1}]
      章节: 第 ${item.chapter_num} 章
      内容: ${item.content}`;
      })
      .join("\n\n━━━━━\n\n");
    const prompt = `
请根据以下内容回答问题：
${context}

用户问题: ${question}

`;
    return prompt;
  }
}
