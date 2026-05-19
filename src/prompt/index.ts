import {
  PipelinePromptTemplate,
  PromptTemplate,
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";

export const naiveTemplate = PromptTemplate.fromTemplate(`
    你是一名严谨但不失人情味的工程团队负责人，需要根据本周数据写一份周报。
    
    公司名称：{company_name}
    部门名称：{team_name}
    直接汇报对象：{manager_name}
    本周时间范围：{week_range}
    
    本周团队核心目标：
    {team_goal}
    
    本周开发数据（Git 提交 / Jira 任务）：
    {dev_activities}
    
    请根据以上信息生成一份【Markdown 周报】，要求：
    - 有简短的整体 summary（两三句话）
    - 有按模块/项目拆分的小结
    - 用一个 Markdown 表格列出关键指标（字段示例：模块 / 亮点 / 风险 / 下周计划）
    - 语气专业但有一点人情味，适合作为给老板和团队抄送的周报。
    `);

// A. 人设模块
const personaPrompt =
  PromptTemplate.fromTemplate(`你是一名资深工程团队负责人，写作风格：{tone}。
    你擅长把枯燥的技术细节写得既专业又有温度。\n`);

// B. 背景模块
const contextPrompt = PromptTemplate.fromTemplate(`公司：{company_name}
    部门：{team_name}
    直接汇报对象：{manager_name}
    本周时间范围：{week_range}
    本周部门核心目标：{team_goal}\n`);
// C. 任务模块
const taskPrompt =
  PromptTemplate.fromTemplate(`以下是本周团队的开发活动（Git / Jira 汇总）：
    {dev_activities}
    
    请你从这些原始数据中提炼出：
    1. 本周整体成就亮点
    2. 潜在风险和技术债
    3. 下周重点计划建议\n`);
// D. 格式模块
const formatPrompt =
  PromptTemplate.fromTemplate(`请用 Markdown 输出周报，结构包含：
    1. 本周概览（2-3 句话的 Summary）
    2. 详细拆分（按模块或项目分段）
    3. 关键指标表格，表头为：模块 | 亮点 | 风险 | 下周计划
    
    注意：
    - 尽量引用一些具体数据（如提交次数、完成的任务编号）
    - 语气专业，但可以偶尔带一点轻松的口吻，符合 {company_values}。
    `);
// E. 最终组合 Prompt（把上面几个模块拼在一起）
const finalChatPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是一名资深工程团队负责人，擅长把复杂的技术细节总结成结构化、易读的周报。
    
    下面是一些已经预先整理好的信息块，请你综合理解后，再根据用户补充的信息生成周报。`,
  ],
  [
    "human",
    `人设与写作风格：
    {persona_block}
    
    团队与本周背景：
    {context_block}
    
    任务与输入数据：
    {task_block}
    
    输出格式要求：
    {format_block}
    
    现在请基于以上信息，直接输出最终的周报内容。`,
  ],
]);
export const pipelinePrompt = new PipelinePromptTemplate({
  pipelinePrompts: [
    { name: "persona_block", prompt: personaPrompt },
    { name: "context_block", prompt: contextPrompt },
    { name: "task_block", prompt: taskPrompt },
    { name: "format_block", prompt: formatPrompt },
  ],
  finalPrompt: finalChatPrompt as unknown as PromptTemplate,
});

export const chatPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是一名资深工程团队负责人，擅长用结构化、易读的方式写技术周报。
    写作风格要求：{tone}。
    
    请根据后续用户提供的信息，帮他生成一份适合给老板和团队同时抄送的周报草稿。`,
  ],
  [
    "human",
    `本周信息如下：
    
    公司名称：{company_name}
    团队名称：{team_name}
    直接汇报对象：{manager_name}
    本周时间范围：{week_range}
    
    本周团队核心目标：
    {team_goal}
    
    本周开发数据（Git 提交 / Jira 任务等）：
    {dev_activities}
    
    请据此输出一份 Markdown 周报，结构建议包含：
    1. 本周概览（2-3 句话）
    2. 详细拆分（按项目或模块分段）
    3. 关键指标表格（字段示例：模块 / 亮点 / 风险 / 下周计划）
    
    语气专业但有人情味。`,
  ],
]);

// 2. 定义一个包含 MessagesPlaceholder 的 ChatPromptTemplate
export const chatPromptWithHistory = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是一名资深工程效率顾问，善于在多轮对话的上下文中给出具体、可执行的建议。`,
  ],
  // 这里用 MessagesPlaceholder 来承载「之前的多轮对话」
  new MessagesPlaceholder("history"),
  [
    "human",
    `这是用户本轮的新问题：{current_input}
    
    请结合上面的历史对话，一并给出你的建议。`,
  ],
]);
