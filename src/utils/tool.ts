import { tool } from "langchain";
import { execa } from "execa";
import { z } from "zod";
import { infoLog, errorLog } from "./color";
import { readFile, mkdir, writeFile, readdir } from "fs/promises";
import path from "path";

export const execaTool = tool(
  async ({ command }: { command: string }) => {
    try {
      const { stdout } = await execa(command, {
        shell: true,
      });
      infoLog(`调用 execa 工具成功执行命令: ${command}, 输出: ${stdout}`);
      return stdout;
    } catch (error) {
      errorLog(
        `调用 execa 工具执行命令失败: ${command}, 错误: ${error instanceof Error ? error.message : String(error)}`,
      );
      return `调用 execa 工具执行命令失败: ${command}, 错误: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "execa",
    description: "执行脚本命令并返回输出",
    schema: z.object({
      command: z.string().describe("要执行的命令"),
    }),
  },
);

export const readFileTool = tool(
  async ({ path }: { path: string }) => {
    try {
      const content = await readFile(path, "utf-8");
      infoLog(`调用 readFile 工具成功读取文件: ${path}, 内容: ${content}`);
      return content;
    } catch (error) {
      errorLog(
        `调用 readFile 工具读取文件失败: ${path}, 错误: ${error instanceof Error ? error.message : String(error)}`,
      );
      return `调用 readFile 工具读取文件失败: ${path}, 错误: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "readFile",
    description:
      "用此工具来读取文件内容。当用户要求读取文件、查看代码、分析文件内容时，调用此工具。输入文件路径（可以是相对路径或绝对路径）",
    schema: z.object({
      path: z.string().describe("要读取的文件路径"),
    }),
  },
);
// 2. 写入文件工具
export const writeFileTool = tool(
  async ({ filePath, content }) => {
    try {
      const dir = path.dirname(filePath);
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, content, "utf-8");
      infoLog(
        `  [工具调用] writeFile("${filePath}") - 成功写入 ${content.length} 字节`,
      );
      return `文件写入成功: ${filePath}`;
    } catch (error) {
      errorLog(
        `  [工具调用] writeFile("${filePath}") - 错误: ${error instanceof Error ? error.message : String(error)}`,
      );
      return `写入文件失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "writeFile",
    description: "向指定路径写入文件内容，自动创建目录",
    schema: z.object({
      filePath: z.string().describe("文件路径"),
      content: z.string().describe("要写入的文件内容"),
    }),
  },
);
// 4. 列出目录内容工具
export const listDirectoryTool = tool(
  async ({ directoryPath }) => {
    try {
      const files = await readdir(directoryPath);
      infoLog(
        `  [工具调用] listDirectory("${directoryPath}") - 找到 ${files.length} 个项目`,
      );
      return `目录内容:\n${files.map((f) => `- ${f}`).join("\n")}`;
    } catch (error) {
      errorLog(
        `  [工具调用] listDirectory("${directoryPath}") - 错误: ${error instanceof Error ? error.message : String(error)}`,
      );
      return `列出目录失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: "listDirectory",
    description: "列出指定目录下的所有文件和文件夹",
    schema: z.object({
      directoryPath: z.string().describe("目录路径"),
    }),
  },
);
