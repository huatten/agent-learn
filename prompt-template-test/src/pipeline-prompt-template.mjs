import { PromptTemplate, PipelinePromptTemplate } from "@langchain/core/prompts";

// 这个文件演示的是 PipelinePromptTemplate。
//
// 前面的 PromptTemplate 是“一整段 prompt 里放变量”。
// PipelinePromptTemplate 更进一步：把一份复杂 prompt 拆成多个小模块，
// 每个模块都是一个独立的 PromptTemplate，最后再组合成完整 prompt。
//
// 这样做的好处是：
// 1. 结构更清楚：人设、背景、任务、格式要求分开维护
// 2. 更容易复用：后面的文件可以复用 personPrompt / contextPrompt
// 3. 更容易扩展：想换任务类型时，只替换 taskPrompt 或 formatPrompt 即可
//
// 你可以把它理解成搭积木：
// 小 Prompt 是积木块，PipelinePromptTemplate 负责把这些积木拼成最终 Prompt。



// A. 人设模块。
//
// 这个模块只负责描述“AI 应该以什么身份和语气写作”。
// {tone} 是变量，后面 format() 时传入，例如“专业、清晰、略带幽默”。
export const personPrompt = PromptTemplate.fromTemplate(
`你是一名资深工程团队负责人，写作风格：{tone}。
你擅长把枯燥的技术细节写得既专业又有温度。\n`
)

// B. 背景模块。
//
// 这个模块只负责描述“这次周报的业务背景”：
// 公司、部门、汇报对象、时间范围、团队目标。
//
// 这些信息通常在不同周报中会变，所以都做成变量。
export const contextPrompt = PromptTemplate.fromTemplate(
`公司：{company_name}
 部门：{team_name}
 直接汇报对象：{manager_name}
 本周时间范围：{week_range}
 本周部门核心目标：{team_goal}\n`
)

// C. 任务模块。
//
// 这个模块只负责告诉模型：
// 输入数据是什么，以及希望模型从这些数据里提炼什么。
//
// {dev_activities} 是本周 Git / Jira 等原始开发数据。
export const taskPrompt = PromptTemplate.fromTemplate(
    `以下是本周团队的开发活动（Git / Jira 汇总）：
{dev_activities}

请你从这些原始数据中提炼出：
1. 本周整体成就亮点
2. 潜在风险和技术债
3. 下周重点计划建议\n`
)

// D. 格式模块。
//
// 这个模块只负责规定最终输出长什么样：
// 用 Markdown、包含哪些章节、表格表头是什么、语气注意事项。
//
// {company_values} 是变量，用来让输出贴合公司文化或表达风格。
export const formatPrompt = PromptTemplate.fromTemplate(
    `请用 Markdown 输出周报，结构包含：
1. 本周概览（2-3 句话的 Summary）
2. 详细拆分（按模块或项目分段）
3. 关键指标表格，表头为：模块 | 亮点 | 风险 | 下周计划

注意：
- 尽量引用一些具体数据（如提交次数、完成的任务编号）
- 语气专业，但可以偶尔带一点轻松的口吻，符合 {company_values}。
`
)

// E. 最终组合 Prompt。
//
// 注意这里不是直接放公司名、团队名这些原始变量，
// 而是放四个“已经由小模板生成好的模块内容”：
// - {persona_block}
// - {context_block}
// - {task_block}
// - {format_block}
//
// PipelinePromptTemplate 会先生成这四个 block，
// 再把它们填进 finalWeeklyPrompt。
const finalWeeklyPrompt = PromptTemplate.fromTemplate(
`{persona_block}
{context_block}
{task_block}
{format_block}

现在请生成本周的最终周报：`
)


// 创建 PipelinePromptTemplate。
//
// 它的工作顺序可以理解成两步：
// 1. 先运行 pipelinePrompts 里的每个小模板，得到多个中间 block
// 2. 再把这些 block 填入 finalPrompt，生成最终完整 prompt
export const pipelinePrompt = new PipelinePromptTemplate({
    // pipelinePrompts 定义“中间步骤”。
    // 每一项都有两个字段：
    // - prompt：要运行的小模板
    // - name：这个小模板生成结果在 finalPrompt 里的变量名
    pipelinePrompts:[
        {
            // personPrompt 生成的内容会填到 finalWeeklyPrompt 的 {persona_block}。
            prompt: personPrompt,
            name: "persona_block",
        },
        {
            // contextPrompt 生成的内容会填到 {context_block}。
            prompt: contextPrompt,
            name: "context_block",
        },
        {
            // taskPrompt 生成的内容会填到 {task_block}。
            prompt: taskPrompt,
            name: "task_block",
        },
        {
            // formatPrompt 生成的内容会填到 {format_block}。
            prompt: formatPrompt,
            name: "format_block",
        },
    ],

    // finalPrompt 是最终模板。
    // 它接收上面生成的 persona/context/task/format 四个 block。
    finalPrompt: finalWeeklyPrompt,

    // inputVariables 是整个 pipeline 对外需要的变量列表。
    // 这些变量会被分发给不同的小模板使用。
    //
    // 例如：
    // - tone 只被 personPrompt 使用
    // - company_name/team_name 等被 contextPrompt 使用
    // - dev_activities 被 taskPrompt 使用
    // - company_values 被 formatPrompt 使用
    inputVariables: [
        "tone",
        "company_name",
        "team_name",
        "manager_name",
        "week_range",
        "team_goal",
        "dev_activities",
        "company_values",
    ],
});


// 使用 pipelinePrompt.format() 生成最终 prompt。
//
// 这里传入的是所有小模板需要的变量。
// PipelinePromptTemplate 会自动把变量分发到对应模块，
// 再把各模块结果组合成最终周报提示词。
const pipelineFormated = await pipelinePrompt.format({
    // 给人设模块使用。
    tone: '专业、清晰、略带幽默',

    // 给背景模块使用。
    company_name: '星航科技',
    team_name: 'AI 平台组',
    manager_name: '王总',
    week_range: '2025-02-03 ~ 2025-02-09',
    team_goal: '完成智能周报 Agent 的 MVP 版本，并打通 Git / Jira 数据源。',

    // 给任务模块使用。
    dev_activities:
        '- Git: 58 次提交，3 个主要分支合并\n' +
        '- Jira: 完成 12 个 Story，关闭 7 个 Bug\n' +
        '- 关键任务：完成智能周报 Pipeline 设计、实现 Prompt 拆分、接入 ExampleSelector',

    // 给格式模块使用。
    company_values: '「极致、开放、靠谱」的价值观',
})


// 打印最终组合后的 Prompt。
// 学习 PipelinePromptTemplate 时建议重点看这里：
// 你会看到四个小模板的内容已经被拼成了一份完整、自然的提示词。
console.log('PipelinePromptTemplate 组合后的 Prompt：');
console.log(pipelineFormated);

// 打印结果如下：


// 你是一名资深工程团队负责人，写作风格：专业、清晰、略带幽默。
// 你擅长把枯燥的技术细节写得既专业又有温度。
//
// 公司：星航科技
// 部门：AI 平台组
// 直接汇报对象：王总
// 本周时间范围：2025-02-03 ~ 2025-02-09
// 本周部门核心目标：完成智能周报 Agent 的 MVP 版本，并打通 Git / Jira 数据源。
//
// 以下是本周团队的开发活动（Git / Jira 汇总）：
// - Git: 58 次提交，3 个主要分支合并
// - Jira: 完成 12 个 Story，关闭 7 个 Bug
// - 关键任务：完成智能周报 Pipeline 设计、实现 Prompt 拆分、接入 ExampleSelector
//
// 请你从这些原始数据中提炼出：
// 1. 本周整体成就亮点
// 2. 潜在风险和技术债
// 3. 下周重点计划建议
//
// 请用 Markdown 输出周报，结构包含：
// 1. 本周概览（2-3 句话的 Summary）
// 2. 详细拆分（按模块或项目分段）
// 3. 关键指标表格，表头为：模块 | 亮点 | 风险 | 下周计划
//
// 注意：
// - 尽量引用一些具体数据（如提交次数、完成的任务编号）
// - 语气专业，但可以偶尔带一点轻松的口吻，符合 「极致、开放、靠谱」的价值观。
//
//
// 现在请生成本周的最终周报：
