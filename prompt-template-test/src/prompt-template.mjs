import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";

// 这个文件演示的是 LangChain 最基础的 PromptTemplate。
//
// 先把一大段 prompt 写成“模板”，模板里用 {变量名} 留出可替换的位置；
// 再用 format() 把真实业务数据填进去；
// 最后得到一段完整 prompt，传给大模型。
//
// 这样做的好处是：
// 1. prompt 结构更清楚，哪些是固定话术、哪些是动态数据一眼能看出来
// 2. 同一套模板可以复用给不同公司、团队和周报数据
// 3. 后续调整提示词时，只需要改模板，不用到处复制粘贴长字符串

// 创建一个聊天模型实例。
// 这部分和前面项目里的写法一样，模型配置都从 .env 读取。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称。
    model: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    apiKey: process.env.OPENAI_API_KEY,

    // 周报生成希望结构稳定、语气稳定，所以 temperature 设置为 0。
    temperature: 0,

    configuration: {
        // OPENAI_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 创建一个 PromptTemplate。
//
// fromTemplate() 接收一段模板字符串。
// 模板里的 {company_name}、{team_name}、{manager_name} 等就是占位符。
//
// 这段模板可以拆成四层理解：
// 1. 角色设定：让模型扮演“严谨但不失人情味的工程团队负责人”
// 2. 背景变量：公司、部门、汇报对象、时间范围
// 3. 输入数据：团队目标、本周开发活动
// 4. 输出要求：生成 Markdown 周报，并包含 summary、小结、表格和语气要求
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

// 使用 format() 给模板填入真实数据。
//
// 注意：
// - format() 传入的是一个对象
// - 对象的 key 必须和模板里的占位符同名
// - format() 返回的是最终完整 prompt 字符串，不是模型回复
const prompt1 = await nativeTemplate.format({
    // 对应模板里的 {company_name}。
    company_name: '星航科技',

    // 对应模板里的 {team_name}。
    team_name: '数据智能平台组',

    // 对应模板里的 {manager_name}。
    manager_name: '刘总',

    // 对应模板里的 {week_range}。
    week_range: '2025-03-10 ~ 2025-03-16',

    // 对应模板里的 {team_goal}。
    team_goal: '完成用户画像服务的灰度上线，并验证核心指标是否达标。',

    // 对应模板里的 {dev_activities}。
    // 这里用多行字符串列出团队成员本周工作，
    // 让模型有足够具体的事实依据来写周报。
    dev_activities:
        '- 阿兵：完成用户画像服务的 Canary 发布与回滚脚本优化，提交 27 次，相关任务：DATA-321 / DATA-335\n' +
        '- 小李：接入埋点数据，打通埋点 → Kafka → DWD → 画像服务的全链路，提交 22 次\n' +
        '- 小赵：完善画像服务的告警与Dashboard，新增 8 个告警规则，提交 15 次\n' +
        '- 小周：配合产品输出 A/B 实验报表，支持 3 条对外汇报用数据',
})

// 打印格式化后的 prompt。
// 学习 PromptTemplate 时建议一定看这里：
// 这样能确认所有占位符都被替换成功，也能检查最终发给模型的提示词是否自然。
console.log('格式化后的提示词:');
console.log(prompt1);

try {
    console.log("🤔 正在调用大模型...\n");

    // 把格式化后的 prompt 发给模型，并使用 stream 流式接收结果。
    //
    // 这里也可以用 model.invoke(prompt1) 一次性拿完整结果；
    // 使用 stream 的好处是周报还在生成时，就能在终端实时看到内容。
    const stream = await model.stream(prompt1);

    console.log('\nAI 回答:');

    // 逐块读取模型输出。
    // 每个 chunk 是模型当前生成的一小段内容。
    for await (const chunk of stream) {
        // 实时打印，不使用 console.log，是为了避免每个 chunk 都额外换行。
        process.stdout.write(chunk?.content);
    }
}catch (error) {
    // 常见错误场景：
    // 1. .env 没有正确配置模型名、API Key 或 baseURL
    // 2. 模板里写了某个占位符，但 format() 时没有传对应字段
    // 3. 当前模型或服务商不支持 stream
    console.error("❌ 错误:", error.message);
}
