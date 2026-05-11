import { MultiServerMCPClient } from "@langchain/mcp-adapters";
export const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    "my-mcp-server": {
      command: "node",
      args: ["/Users/zhengjiajun/zjj/self/zjj_agent/src/mcp/test.mjs"],
    },
  },
});
export const tools = await mcpClient.getTools();
const res = await mcpClient.listResources();
let resourceContent = '';
for (const [serverName, resources] of Object.entries(res)) {
  for (const resource of resources) {
    const content = await mcpClient.readResource(serverName, resource.uri);
    resourceContent +=  content[0].text;;
  }
}
export {resourceContent as mcpResourceContent}
