import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";

// 这个文件可以和 prompt-template.mjs 放在一起看。
//
// 它们使用的是同一份 PromptTemplate 模板，
// 但 format() 时传入了不同的公司、团队、目标和开发数据。
//
// 这正是 PromptTemplate 的价值：
// 模板逻辑只写一遍，不同业务数据填进去，就能生成不同场景下的完整 prompt。
// 也就是说：
// - prompt-template.mjs：数据智能平台组的周报
// - prompt-template2.mjs：订单结算后端组的周报
//
// 学习时可以对比两份文件的输出，观察“同一模板 + 不同变量”会如何影响模型生成结果。

// 创建聊天模型实例。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称。
    model: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    apiKey: process.env.OPENAI_API_KEY,

    // 周报类任务希望输出稳定，所以设置为 0。
    temperature: 0,

    configuration: {
        // OPENAI_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 这份模板和 prompt-template.mjs 中的模板一致。
//
// 模板里用 {变量名} 留出动态位置，
// 后面 format() 时会把真实数据替换进去。
const nativeTemplate = PromptTemplate.fromTemplate(`
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
`)

// 这里传入的是第二组业务数据。
//
// 注意：虽然变量值变了，但 key 仍然必须和模板里的占位符保持一致。
// 例如模板里有 {company_name}，这里就必须仍然传 company_name。
const prompt2 = await nativeTemplate.format({
    // 公司名称变成“极光云科技”。
    company_name: '极光云科技',

    // 团队名称变成“订单结算后端组”。
    team_name: '订单结算后端组',

    // 汇报对象变成“陈总”。
    manager_name: '陈总',

    // 本周时间范围。
    week_range: '2025-04-07 ~ 2025-04-13',

    // 本周目标从“功能灰度上线”变成“稳定性和技术债治理”。
    // 同一个模板会因为这个目标不同，生成完全不同侧重点的周报。
    team_goal: '本周以稳定性为主，集中清理历史技术债和高频告警。',

    // 本周开发活动。
    // 这里的原始数据包含 Bug 修复、性能优化、告警治理、单测补齐，
    // 模型会基于这些事实提炼 summary、风险和下周计划。
    dev_activities:
        '- 老王：修复高优先级线上 Bug 7 个（包含两起支付超时问题），提交 19 次，关联工单：PAY-1024 / PAY-1056\n' +
        '- 小何：重构结算批任务调度逻辑，将执行时间从 35min 优化到 18min，提交 24 次\n' +
        '- 小陈：梳理告警策略，合并冗余告警 12 条，新增 SLO 监控 3 项，提交 16 次\n' +
        '- 实习生小刘：补齐历史接口的缺失单测，用例覆盖 12 个核心方法，整体覆盖率从 52% 提升到 61%',
});

// 打印格式化后的 prompt。
// 对比 prompt-template.mjs 的输出，可以直观看到：
// 模板结构没变，但动态数据已经全部替换成了第二组内容。
console.log('格式化后的提示词:');
console.log(prompt2);

try {
    console.log("🤔 正在调用大模型...\n");

    // 把第二份格式化后的 prompt 发给模型。
    // 这里继续使用 stream，方便实时看到周报生成过程。
    const stream = await model.stream(prompt2);

    console.log('\nAI 回答:');

    // 实时打印模型生成内容。
    for await (const chunk of stream) {
        process.stdout.write(chunk?.content);
    }
}catch (error) {
    // 常见错误场景：
    // 1. .env 配置不正确，导致模型调用失败
    // 2. format() 缺少模板里需要的变量
    // 3. 当前模型或服务商不支持 stream
    console.error("❌ 错误:", error.message);
}
