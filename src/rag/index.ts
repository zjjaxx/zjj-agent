import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import { withSpinner } from "../utils/progress";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { infoLog, successLog } from "../utils/color";
import {
  MilvusClient,
  DataType,
  MetricType,
  IndexType,
} from "@zilliz/milvus2-sdk-node";

const COLLECTION_NAME = "ai_diary";
const VECTOR_DIM = 1024;

export class RAG {
  public embeddings: OpenAIEmbeddings;
  public client: MilvusClient;
  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      apiKey: process.env.EMBEDDINGS_MODEL_KEY,
      model: process.env.EMBEDDINGS_MODEL_NAME,
      batchSize: 10,
      configuration: {
        baseURL: process.env.EMBEDDINGS_MODEL_BASE_URL,
      },
      dimensions: VECTOR_DIM,
    });
    this.client = new MilvusClient({
      address: process.env.MILVUS_ADDRESS ?? "localhost:19530",
    });
  }
  async generateVectorStore(webDocs: Document[]) {
    const vectorStore = withSpinner(
      "🚀生成向量存储中...",
      async () =>
        await MemoryVectorStore.fromDocuments(webDocs, this.embeddings),
    );
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
  async executeMilvus() {
    infoLog("创建集合中...");
    await this.client.createCollection({
      collection_name: COLLECTION_NAME,
      fields: [
        {
          name: "id",
          data_type: DataType.VarChar,
          max_length: 50,
          is_primary_key: true,
        },
        { name: "vector", data_type: DataType.FloatVector, dim: VECTOR_DIM },
        { name: "content", data_type: DataType.VarChar, max_length: 5000 },
        { name: "date", data_type: DataType.VarChar, max_length: 50 },
        { name: "mood", data_type: DataType.VarChar, max_length: 50 },
        {
          name: "tags",
          data_type: DataType.Array,
          element_type: DataType.VarChar,
          max_capacity: 10,
          max_length: 50,
        },
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

    infoLog("加载集合中...");
    await this.client.loadCollection({ collection_name: COLLECTION_NAME });
    successLog("集合加载成功");

    infoLog("插入日记数据中...");
    const diaryContents = [
      {
        id: "diary_001",
        content:
          "今天天气很好，去公园散步了，心情愉快。看到了很多花开了，春天真美好。",
        date: "2026-01-10",
        mood: "happy",
        tags: ["生活", "散步"],
      },
      {
        id: "diary_003",
        content:
          "周末和朋友去爬山，天气很好，心情也很放松。享受大自然的感觉真好。",
        date: "2026-01-12",
        mood: "relaxed",
        tags: ["户外", "朋友"],
      },
      {
        id: "diary_004",
        content:
          "今天学习了 Milvus 向量数据库，感觉很有意思。向量搜索技术真的很强大。",
        date: "2026-01-12",
        mood: "curious",
        tags: ["学习", "技术"],
      },
      {
        id: "diary_005",
        content:
          "晚上做了一顿丰盛的晚餐，尝试了新菜谱。家人都说很好吃，很有成就感。",
        date: "2026-01-13",
        mood: "proud",
        tags: ["美食", "家庭"],
      },
    ];
    infoLog("嵌入模型生成向量中...");
    const diaryData = await Promise.all(
      diaryContents.map(async (diary) => ({
        ...diary,
        vector: await this.embeddings.embedQuery(diary.content),
      })),
    );

    const insertResult = await this.client.insert({
      collection_name: COLLECTION_NAME,
      data: diaryData,
    });
    successLog(`插入 ${insertResult.insert_cnt} 条记录成功`);
  }
  async generatePrompt(milvusQueryVector: number[], question: string) {
    const searchResult = await this.client.search({
      collection_name: COLLECTION_NAME,
      vector: milvusQueryVector,
      limit: 2,
      metric_type: MetricType.COSINE,
      output_fields: ["id", "content", "date", "mood", "tags"],
    });
    infoLog(`Found ${searchResult.results.length} results:\n`);
    searchResult.results.forEach((item, index) => {
      infoLog(`${index + 1}. [Score: ${item.score.toFixed(4)}]`);
      infoLog(`   ID: ${item.id}`);
      infoLog(`   Date: ${item.date}`);
      infoLog(`   Mood: ${item.mood}`);
      infoLog(`   Tags: ${item.tags?.join(", ")}`);
      infoLog(`   Content: ${item.content}\n`);
    }); // 3. 构建上下文
    const context = searchResult.results
      .map((diary, i) => {
        return `[日记 ${i + 1}]
    日期: ${diary.date}
    心情: ${diary.mood}
    标签: ${diary.tags?.join(", ")}
    内容: ${diary.content}`;
      })
      .join("\n\n━━━━━\n\n");
    const prompt = `
请根据以下日记内容回答问题：
${context}

用户问题: ${question}

回答要求：
1. 如果日记中有相关信息，请结合日记内容给出详细、温暖的回答
2. 可以总结多篇日记的内容，找出共同点或趋势
3. 如果日记中没有相关信息，请温和地告知用户
4. 用第一人称"你"来称呼日记的作者
5. 回答要有同理心，让用户感到被理解和关心`;
    return prompt;
  }
}
