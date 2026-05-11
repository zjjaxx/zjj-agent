import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { infoLog } from "../utils/color";

export let mcpClient: MultiServerMCPClient | null = null;
export const generateMcpClient = () => {
  infoLog(`MCP_AMAP_API_KEY: ${process.env.MCP_AMAP_API_KEY}`);
  infoLog(`ALLOWED_PATHS: ${process.env.ALLOWED_PATHS}`);
  mcpClient = new MultiServerMCPClient({
    mcpServers: {
      "my-mcp-server": {
        command: "node",
        args: ["/Users/zhengjiajun/zjj/self/zjj_agent/src/mcp/test.mjs"],
      },
      "amap-maps-streamableHTTP": {
        url: `https://mcp.amap.com/mcp?key=${process.env.MCP_AMAP_API_KEY}`,
      },
      "chrome-devtools": {
        command: "npx",
        args: ["-y", "chrome-devtools-mcp@latest"],
      },
      filesystem: {
        command: "npx",
        args: [
          "-y",
          "@modelcontextprotocol/server-filesystem",
          ...(process.env.ALLOWED_PATHS?.split(",") || []),
        ],
      },
    },
  });
  return mcpClient;
};
export const getTools = async () => {
  return (await mcpClient?.getTools()) ?? [];
};
export const getMcpResourceContent = async () => {
  const res = await mcpClient?.listResources();
  let resourceContent = "";
  for (const [serverName, resources] of Object.entries(res || {})) {
    for (const resource of resources) {
      const content = await mcpClient?.readResource(serverName, resource.uri);
      resourceContent += content?.[0]?.text || "";
    }
  }
  return resourceContent;
};
