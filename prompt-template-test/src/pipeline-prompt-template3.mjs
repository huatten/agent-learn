import { PromptTemplate, PipelinePromptTemplate, ChatPromptTemplate } from "@langchain/core/prompts";
import { personPrompt, contextPrompt } from './pipeline-prompt-template.mjs'


// 这个文件演示的是：PipelinePromptTemplate + ChatPromptTemplate。
//
// 前面的 pipeline-prompt-template.mjs 最终产出的是一个字符串 prompt。
// 但真实项目里，聊天模型更常见的调用方式是 messages 数组：
// [
//   SystemMessage,
//   HumanMessage,
//   AIMessage,
//   ToolMessage,
// ]
//
// 所以更常见的组合方式是：
// 1. PipelinePromptTemplate 负责把 prompt 拆成多个可复用模块
// 2. ChatPromptTemplate 负责把最终结果组织成 system / human 消息
// 3. 最后得到的是 messages，而不是单个字符串
//
// 可以把这个文件理解成：
// “模块化 prompt” + “聊天消息格式” 的结合版。




// A. 本场景自己的任务说明模块。
//
// 这个模块负责描述“本周技术周报”这个具体任务。
// 它会接收 dev_activities，把 Git / Jira / 运维等事实交给模型。
const weeklyTaskPrompt = PromptTemplate.fromTemplate(
    `以下是本周与你所在团队相关的关键事实与数据（Git / Jira / 运维等）：
{dev_activities}

请你基于这些信息，帮我生成一份【技术周报】，重点包含：
1. 本周整体达成情况
2. 关键成果与亮点
3. 主要问题 / 风险
4. 下周的改进方向与优先级建议
`
);

// B. 本场景自己的格式要求模块。
//
// 这个模块只规定最终周报的输出结构和语气。
// 注意这里仍然用 {tone}，说明同一个 tone 变量可以被多个模块复用。
const weeklyFormatPrompt = PromptTemplate.fromTemplate(
    `请用 Markdown 写这份周报，结构建议为：
1. 本周概览（2-3 句话）
2. 详细拆分（按项目或模块分段）
3. 关键指标表格（字段示例：模块 / 亮点 / 风险 / 下周计划）

语气要求：{tone}，既专业清晰，又适合发给老板并抄送团队。`
);

// C. 最终的 ChatPromptTemplate。
//
// 和前两个 Pipeline 示例不同：
// 这里的 finalPrompt 不是普通 PromptTemplate，而是 ChatPromptTemplate。
//
// 它接收 Pipeline 生成的四个 block：
// - persona_block
// - context_block
// - task_block
// - format_block
//
// 然后把它们放进带角色的 messages 里。
const finalChatPrompt = ChatPromptTemplate.fromMessages([
    // system 消息：放模型身份和总体规则。
    // 这部分更适合放“你是谁、总体任务是什么”。
    [
        'system',
        `你是一名资深工程团队负责人，擅长把复杂的技术细节总结成结构化、易读的周报。

下面是一些已经预先整理好的信息块，请你综合理解后，再根据用户补充的信息生成周报。`,
    ],
    // human 消息：放这次具体输入的信息块。
    // 这些 block 不是直接手写的，而是 Pipeline 的中间模板生成后填进来的。
    [
        'human',
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
])


// 创建 PipelinePromptTemplate。
//
// 这里 Pipeline 的中间阶段仍然是普通 PromptTemplate：
// personPrompt / contextPrompt / weeklyTaskPrompt / weeklyFormatPrompt。
//
// 但最后一步 finalPrompt 换成了 ChatPromptTemplate，
// 因此最终结果会是 ChatPromptValue，可以转换成 messages。
const weeklyChatPipelinePrompt = new PipelinePromptTemplate({
    // 这些小模板会先被格式化成四个 block。
    pipelinePrompts:[
        {
            // 复用 pipeline-prompt-template.mjs 里的人设模块。
            prompt: personPrompt, // 复用人设
            name: "persona_block",
        },
        {
            // 复用背景模块。
            prompt: contextPrompt, // 复用背景
            name: "context_block",
        },
        {
            // 当前文件自己的任务模块。
            prompt: weeklyTaskPrompt,
            name: "task_block",
        },
        {
            // 当前文件自己的格式模块。
            prompt: weeklyFormatPrompt,
            name: "format_block",
        },
    ],

    // 注意：这里的 finalPrompt 是 ChatPromptTemplate，而不是普通 PromptTemplate。
    //
    // 这就是本文件和 pipeline-prompt-template.mjs 最大的区别：
    // - 普通 finalPrompt：最终得到字符串
    // - Chat finalPrompt：最终得到 messages
    finalPrompt: finalChatPrompt, // 注意：这里的 finalPrompt 是 ChatPromptTemplate，而不是普通 PromptTemplate

    // 整个 pipeline 对外需要的变量。
    // 这些变量会分发给不同模块：
    // - tone 给 personPrompt 和 weeklyFormatPrompt
    // - company/team/manager/week/team_goal 给 contextPrompt
    // - dev_activities 给 weeklyTaskPrompt
    inputVariables: [
        "tone",
        "company_name",
        "team_name",
        "manager_name",
        "week_range",
        "team_goal",
        "dev_activities",
    ],
});

// E. 示例：构造一份 ChatPromptValue。
//
// 这里不用 format()，而是用 formatPromptValue()。
//
// 原因是 finalPrompt 是 ChatPromptTemplate，
// 最终结果不是普通字符串，而是一个 PromptValue。
// 后面可以通过 promptValue.toChatMessages() 转成 messages 数组。
const promptValue = await weeklyChatPipelinePrompt.formatPromptValue({
    // 写作语气。
    tone: '专业、清晰、略带鼓励',

    // 背景信息。
    company_name: '星航科技',
    team_name: 'AI 平台组',
    manager_name: '王总',
    week_range: '2025-05-12 ~ 2025-05-18',
    team_goal: '完成周报自动生成能力的灰度验证，并收集团队反馈。',

    // 本周事实数据。
    dev_activities:
        '- Git：本周合并 4 个主要特性分支，包含 Prompt 配置化和日志观测优化\n' +
        '- Jira：关闭 9 个 Story / 5 个 Bug，新增 2 个 TechDebt 任务\n' +
        '- 运维：本周线上 P1 事故 0 起，P2 1 起（由配置变更引起，已完成复盘）\n' +
        '- 其他：完成与数据平台、运维平台两次联合评审会议',
});

// 打印最终生成的 messages。
//
// 在真实调用里，可以直接：
// const messages = promptValue.toChatMessages();
// await model.invoke(messages);
//
// 这里先打印出来，是为了观察 Pipeline + ChatPromptTemplate 的组合结果。
console.log('Pipeline + ChatPromptTemplate 生成的消息:');
console.log(promptValue.toChatMessages());

// 打印结果如下：
// [
//     SystemMessage {
//     "content": "你是一名资深工程团队负责人，擅长把复杂的技术细节总结成结构化、易读的周报。\n\n下面是一些已经预先整理好的信息块，请你综合理解后，再根据用户补充的信息生成周报。",
//     "additional_kwargs": {},
//     "response_metadata": {}
// },
//     HumanMessage {
//     "content": "人设与写作风格：\n你是一名资深工程团队负责人，写作风格：专业、清晰、略带鼓励。\n你擅长把枯燥的技术细节写得既专业又有温度。\n\n\n团队与本周背景：\n公司：星航科技\n 部门：AI 平台组\n  直接汇报对象：王总\n 本周时间范围：2025-05-12 ~ 2025-05-18\n 本周部门核心目标：完成周报自动生成能力的灰度验证，并收集团队反馈。\n\n\n任务与输入数据：\n以下是本周与你所在团队相关的关键事实与数据（Git / Jira / 运维等）：\n- Git：本周合并 4 个主要特性分支，包含 Prompt 配置化和日志观测优化\n- Jira：关闭 9 个 Story / 5 个 Bug，新增 2 个 TechDebt 任务\n- 运维：本周线上 P1 事故 0 起，P2 1 起（由配置 变更引起，已完成复盘）\n- 其他：完成与数据平台、运维平台两次联合评审会议\n\n请你基于这些信息，帮我生成一份【技术周报】，重点包含：\n1. 本周整体达成情况\n2. 关键成果与亮点\n3. 主要问题 / 风险\n4. 下 周的改进方向与优先级建议\n\n\n输出格式要求：\n请用 Markdown 写这份周报，结构建议为：\n1. 本周概览（2-3 句话）\n2. 详细拆分（按项目或模块分段）\n3. 关键指标表格（字段示例：模块 / 亮点 / 风险 / 下周计划）\n\n语气要求：专业、清晰、略带鼓励，既专业清晰，又适合发给老板并抄送团队。\n\n现在请基于以上信息，直接输出最终的周报内容。",
//     "additional_kwargs": {},
//     "response_metadata": {}
// }
// ]
