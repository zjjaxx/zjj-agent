import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
export const generateDocs = async () => {
  const loader = new CheerioWebBaseLoader(
    "https://docs.langchain.com/oss/javascript/integrations/document_loaders/web_loaders/web_cheerio",
    {
      // optional params: ...
    },
  );
  const docs = await loader.load();

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500, // 每个分块的字符数
    chunkOverlap: 50, // 分块之间的重叠字符数
  });

  const splitDocuments = await textSplitter.splitDocuments(docs);
  return splitDocuments;
};
