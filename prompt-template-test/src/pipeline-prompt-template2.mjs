import { PromptTemplate, PipelinePromptTemplate } from "@langchain/core/prompts";
import { personPrompt, contextPrompt } from './pipeline-prompt-template.mjs'

// 这个文件演示的是：复用已有 Prompt 模块，组合出一个新场景。
//
// pipeline-prompt-template.mjs 里已经定义了：
// - personPrompt：人设与写作风格
// - contextPrompt：公司、团队、汇报对象、时间范围、团队目标
//
// 这两个模块不只适用于“周报”，也适用于“季度 OKR 回顾邮件”。
// 所以这里直接 import 复用它们，
// 然后只为当前场景新增：
// - okrReviewTaskPrompt：OKR 回顾任务说明
// - okrReviewFormatPrompt：OKR 邮件格式要求
//
// 这就是 PipelinePromptTemplate 很重要的价值：
// 稳定通用的模块复用，变化的场景模块替换。

// 1. 本场景自己的任务模块说明。
//
// 这个模块只负责“季度 OKR 回顾”这个任务本身。
// 和周报不同，这里输入的不是 dev_activities，
// 而是 okr_facts：季度 OKR 进展、重要事件、团队变化等事实。
const okrReviewTaskPrompt = PromptTemplate.fromTemplate(`
    以下是本季度与你所在团队相关的关键事实与数据（OKR 进展、重要事件等）：
    {okr_facts}
    
    请你基于这些信息，整理一份发给 {manager_name} 的【季度 OKR 回顾邮件】，重点包含：
    1. 本季度整体达成情况（相对 OKR 的完成度）
    2. 关键成果与亮点
    3. 暴露出的主要问题 / 风险
    4. 下季度的改进方向与优先级建议
`)

// 2. 本场景自己的格式要求模块。
//
// 这个模块只负责规定“季度 OKR 回顾邮件”应该长什么样。
// 它和周报格式不同：
// - 要有邮件开头
// - 要逐条回顾 OKR
// - 要主动暴露问题和请求支持
const okrReviewFormatPrompt = PromptTemplate.fromTemplate(`
    请用 Markdown 写这封邮件，结构建议为：
    1. 邮件开头（1-2 句话的问候 + 本邮件目的）
    2. 本季度整体概览
    3. 逐条 OKR 的回顾（可分小节）
    4. 主要问题 / 风险
    5. 下季度计划与请求支持
    
    语气保持专业、克制但真诚，既让老板看到成绩，也能感受到你在主动暴露问题、寻求改进。
`)

// 3. 最终组合 Prompt。
//
// 这里仍然使用四个 block：
// - persona_block：复用 personPrompt 生成
// - context_block：复用 contextPrompt 生成
// - task_block：由 okrReviewTaskPrompt 生成
// - format_block：由 okrReviewFormatPrompt 生成
//
// 也就是说，最终结构没变，但 task/format 的具体内容换成了 OKR 邮件场景。
const finalOkrPrompt = PromptTemplate.fromTemplate(`
    {persona_block}
    {context_block}
    {task_block}
    {format_block}
    
    现在请生成本次的【季度 OKR 回顾邮件】：
`)

// 4. 用 PipelinePromptTemplate 组合成最终 Prompt。
const pipelinePrompt = new PipelinePromptTemplate({
    // pipelinePrompts 里定义每个 block 从哪里来。
    pipelinePrompts:[
        {
            // 复用人设模块：
            // 仍然由 tone 控制写作风格。
            prompt: personPrompt, // 复用人设
            name: "persona_block",
        },
        {
            // 复用背景模块：
            // 公司、团队、汇报对象、时间范围、目标这类信息在很多管理文档里都需要。
            prompt: contextPrompt, // 复用背景
            name: "context_block",
        },
        {
            // 替换任务模块：
            // 从“写周报”换成“写季度 OKR 回顾邮件”。
            prompt: okrReviewTaskPrompt,
            name: "task_block",
        },
        {
            // 替换格式模块：
            // 从周报格式换成邮件格式。
            prompt: okrReviewFormatPrompt,
            name: "format_block",
        },
    ],

    // 最终模板：负责把四个 block 拼成一份完整 prompt。
    finalPrompt: finalOkrPrompt,

    // 这个 pipeline 对外需要的变量。
    //
    // 注意这里没有 dev_activities / company_values，
    // 因为当前 OKR 场景不需要它们。
    // 当前新增的是 okr_facts。
    inputVariables: [
        "tone",
        "company_name",
        "team_name",
        "manager_name",
        "week_range",
        "team_goal",
        "okr_facts",
    ],
});


// 填入本次 OKR 回顾邮件的真实数据。
const promptForReview = await pipelinePrompt.format({
    // 给 personPrompt 使用。
    tone: '专业、真诚、偏书面表达',

    // 给 contextPrompt 使用。
    // 这里 week_range 填的是 2025 Q1，虽然字段名仍叫 week_range，
    // 但在这个场景下它表示“季度范围”。
    company_name: '星航科技',
    team_name: 'AI 平台组',
    manager_name: '王总',
    week_range: '2025 Q1',
    team_goal: '支撑公司核心 AI 能力建设，完成三大基础平台的落地与稳定运行。',

    // 给 okrReviewTaskPrompt 使用。
    // 这里是季度 OKR 回顾需要的事实材料。
    // 模型会基于这些事实提炼成果、风险和下季度计划。
    okr_facts:
        '- O1：完成在线特征平台的 V1 上线，覆盖 3 条核心业务链路；\n' +
        '- O2：训练并上线新一代推荐模型，首页 CTR 提升 6.3%；\n' +
        '- O3：推动 GPU 资源利用率优化项目，整体利用率从 42% 提升到 67%；\n' +
        '- 重要事件：一次线上 P1 事故，一次跨部门联合专项；\n' +
        '- 团队：新增 2 位同学，整体人效相比去年同期提升约 18%。',
})


// 打印最终 prompt。
// 学习时重点观察：
// 人设和背景来自复用模块，任务和格式来自本文件的新模块。
console.log('季度 OKR 回顾邮件 Prompt：\n');
console.log(promptForReview);

// 打印结果如下：

// 你是一名资深工程团队负责人，写作风格：专业、真诚、偏书面表达。
// 你擅长把枯燥的技术细节写得既专业又有温度。
//
// 公司：星航科技
// 部门：AI 平台组
// 直接汇报对象：王总
// 本周时间范围：2025 Q1
// 本周部门核心目标：支撑公司核心 AI 能力建设，完成三大基础平台的落地与稳定运行。
//
//
// 以下是本季度与你所在团队相关的关键事实与数据（OKR 进展、重要事件等）：
// - O1：完成在线特征平台的 V1 上线，覆盖 3 条核心业务链路；
// - O2：训练并上线新一代推荐模型，首页 CTR 提升 6.3%；
// - O3：推动 GPU 资源利用率优化项目，整体利用率从 42% 提升到 67%；
// - 重要事件：一次线上 P1 事故，一次跨部门联合专项；
// - 团队：新增 2 位同学，整体人效相比去年同期提升约 18%。
//
// 请你基于这些信息，整理一份发给 王总 的【季度 OKR 回顾邮件】，重点包含：
// 1. 本季度整体达成情况（相对 OKR 的完成度）
// 2. 关键成果与亮点
// 3. 暴露出的主要问题 / 风险
// 4. 下季度的改进方向与优先级建议
//
//
// 请用 Markdown 写这封邮件，结构建议为：
// 1. 邮件开头（1-2 句话的问候 + 本邮件目的）
// 2. 本季度整体概览
// 3. 逐条 OKR 的回顾（可分小节）
// 4. 主要问题 / 风险
// 5. 下季度计划与请求支持
//
// 语气保持专业、克制但真诚，既让老板看到成绩，也能感受到你在主动暴露问题、寻求改进。
//
//
// 现在请生成本次的【季度 OKR 回顾邮件】：
