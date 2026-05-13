import { dirname, parse, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EPubLoader } from "@langchain/community/document_loaders/fs/epub";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { errorLog, infoLog } from "../utils/color";
import { withSpinner } from "../utils/progress";
import { Document } from "@langchain/core/documents";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EPUB_FILE =
  [
    resolve(__dirname, "../public/天龙八部.epub"),
  ].find((p) => existsSync(p)) ?? resolve(__dirname, "public", "天龙八部.epub");
export const COLLECTION_NAME = "ebook_collection";
export const BOOK_NAME = parse(EPUB_FILE).name;
export const CHUNK_SIZE = 500;
/**
 * 加载 EPUB 文件并进行流式处理（边处理边插入）
 */
export async function loadAndProcessEPubStreaming(
  bookId: number,
  insertChunksBatch: (
    chunks: string[],
    bookId: number,
    chapterNum: number,
  ) => Promise<number>,
) {
  try {
    infoLog(`\n开始加载 EPUB 文件: ${EPUB_FILE}`); // 使用 EPubLoader 加载文件，按章节拆分
    const loader = new EPubLoader(EPUB_FILE, {
      splitChapters: true,
    });

    const documents = await loader.load();
    infoLog(`✓ 加载完成，共 ${documents.length} 个章节\n`); // 创建文本拆分器，拆分到 500 个字符

    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNK_SIZE,
      chunkOverlap: 50, // 重叠 50 个字符，保持上下文连贯性
    });

    let totalInserted = 0; // 遍历每个章节，进行二次拆分并立即插入
    documents.push(new Document({
      pageContent: `乔峰爱上了段誉`,
    }));
    for (
      let chapterIndex = 0;
      chapterIndex < documents.length;
      chapterIndex++
    ) {
      const chapter = documents[chapterIndex];
      const chapterContent = chapter.pageContent;
      infoLog(`处理第 ${chapterIndex + 1}/${documents.length} 章...`); // 使用 splitter 进行二次拆分
      const chunks = await textSplitter.splitText(chapterContent);
      infoLog(`  拆分为 ${chunks.length} 个片段`);
      if (chunks.length === 0) {
        infoLog(`  跳过空章节\n`);
        continue;
      }

      await withSpinner("🚀生成向量并插入中...", async () => {
        const insertedCount = await insertChunksBatch(
          chunks,
          bookId,
          chapterIndex + 1,
        );
        totalInserted += insertedCount;
      });
    }

    infoLog(`\n总共插入 ${totalInserted} 条记录\n`);
    return totalInserted;
  } catch (error) {
    errorLog(
      `加载 EPUB 文件时出错:${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}
