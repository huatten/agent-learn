import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate } from "@langchain/core/prompts";

// 这个文件演示 ChatPromptTemplate 的另一种写法。
//
// chat-prompt-template.mjs 里使用的是：
// ChatPromptTemplate.fromMessages([
//   ["system", "..."],
//   ["human", "..."],
// ])
//
// 这个文件使用的是更显式的写法：
// 1. 先用 SystemMessagePromptTemplate 创建 system 消息模板
// 2. 再用 HumanMessagePromptTemplate 创建 human 消息模板
// 3. 最后把两个消息模板交给 ChatPromptTemplate.fromMessages 组合
//
// 两种写法最终都能生成 SystemMessage + HumanMessage。
// 区别主要是代码组织方式：
// - 简写数组方式：更短，适合简单场景
// - 显式 MessagePromptTemplate：更清楚，适合单独复用 system/human 模板

// 创建聊天模型实例。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称。
    model: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    apiKey: process.env.OPENAI_API_KEY,

    // 周报生成希望稳定，所以设置为 0。
    temperature: 0,

    configuration: {
        // OPENAI_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 创建 system 消息模板。
//
// SystemMessagePromptTemplate 专门表示 system 角色的模板。
// 这里放的是“模型身份、写作风格、总体任务”这类全局规则。
const systemTemplate = SystemMessagePromptTemplate.fromTemplate(
    `你是一名资深工程团队负责人，擅长用结构化、易读的方式写技术周报。
写作风格要求：{tone}。

请根据后续用户提供的信息，帮他生成一份适合给老板和团队同时抄送的周报草稿。`
);

// 创建 human 消息模板。
//
// HumanMessagePromptTemplate 专门表示 human 角色的模板。
// 这里放的是本次具体输入：公司、团队、时间范围、目标、开发数据和输出要求。
const humanTemplate = HumanMessagePromptTemplate.fromTemplate(
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

语气专业但有人情味。`
);


// 把 systemTemplate 和 humanTemplate 组合成一个 ChatPromptTemplate。
//
// 注意：fromMessages 不只接受 ["system", "..."] 这种数组简写，
// 也可以直接接受 SystemMessagePromptTemplate / HumanMessagePromptTemplate 实例。
const composedTemplate = ChatPromptTemplate.fromMessages([
    systemTemplate,
    humanTemplate,
]);

// 格式化消息模板，得到真正的 messages 数组。
//
// 这里的变量会分别填入 systemTemplate 和 humanTemplate：
// - tone 填入 systemTemplate
// - company_name/team_name/... 填入 humanTemplate
const chatMessages = await composedTemplate.formatMessages({
    // system 消息中的变量。
    tone: '专业、清晰、略带鼓励',

    // human 消息中的变量。
    company_name: '星航科技',
    team_name: '智能应用平台组',
    manager_name: '王总',
    week_range: '2025-05-05 ~ 2025-05-11',
    team_goal: '完成内部 AI 助手灰度上线，并确保核心链路稳定。',
    dev_activities:
        '- 小李：完成 AI 助手工单流转能力，对接客服系统，提交 25 次\n' +
        '- 小张：接入日志检索和知识库查询，提交 19 次\n' +
        '- 小王：完善监控、告警与埋点，新增 10 条核心告警规则\n' +
        '- 实习生小陈：补充使用文档和 FAQ，支持 3 个内部试点团队',
})

// 打印生成后的消息数组。
// 学习时可以和 chat-prompt-template.mjs 的输出对比：
// 两种写法虽然不同，但最后得到的消息结构是一样的。
console.log('使用 SystemMessagePromptTemplate / HumanMessagePromptTemplate 生成的消息:');
console.log(chatMessages);

// 输出
// [
//     SystemMessage {
//     "content": "你是一名资深工程团队负责人，擅长用结构化、易读的方式写技术周报。\n写作风格要求：专业、清晰、略带鼓励。\n\n请根据后续用户提供的信息，帮他生成一份适合给老板和团队同时抄送的周报草稿。",
//     "additional_kwargs": {},
//     "response_metadata": {}
// },
//     HumanMessage {
//     "content": "本周信息如下：\n\n公司名称：星航科技\n团队名称：智能应用平台组\n直接汇报对象：王总\n本周时间范围：2025-05-05 ~ 2025-05-11\n\n本周团队核心目标：\n完成内部 AI 助手灰度上线，并确保核心 链路稳定。\n\n本周开发数据（Git 提交 / Jira 任务等）：\n- 小李：完成 AI 助手工单流转能力，对接客服系统，提交 25 次\n- 小张：接入日志检索和知识库查询，提交 19 次\n- 小王：完善监控、告警与埋点，新增 10 条核心告警规则\n- 实习生小陈：补充使用文档和 FAQ，支持 3 个内部试点团队\n\n请据此输出一份 Markdown 周报，结构建议包含：\n1. 本周概览（2-3 句话）\n2. 详细拆分（按项目或模块分段）\n3. 关键指标表格（字段示例：模块 / 亮点 / 风险 / 下周计划）\n\n语气专业但有人情味。",
//     "additional_kwargs": {},
//     "response_metadata": {}
// }
// ]

try {
    console.log("🤔 正在调用大模型...\n");

    // 直接把 messages 数组传给聊天模型。
    // 这和上一份 ChatPromptTemplate 示例是一样的调用方式。
    const response = await model.invoke(chatMessages);

    console.log('\nAI 生成的周报草稿::');

    // response 是 AIMessage，真正文本在 response.content。
    console.log(response.content);
}catch (error) {
    // 常见错误场景：
    // 1. .env 配置不正确，导致模型调用失败
    // 2. systemTemplate 或 humanTemplate 里的变量没有传全
    // 3. messages 结构不符合模型或服务商要求
    console.error("❌ 错误:", error.message);
}
