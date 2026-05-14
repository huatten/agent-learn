import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";

// 这个文件演示的是 ChatPromptTemplate。
//
// 前面的 PromptTemplate 生成的是一个“字符串 prompt”。
// 但聊天模型在真实使用中，更多时候接收的是 messages 数组：
// [
//   SystemMessage,
//   HumanMessage,
//   AIMessage,
//   ToolMessage,
// ]
//
// 每条消息都有自己的角色：
// - system：设定模型身份、规则、风格
// - human：用户输入的具体任务和数据
// - ai：模型之前的回复
// - tool：工具执行结果
//
// 所以当我们想模板化“多角色消息”时，就要用 ChatPromptTemplate。
// 它不是只帮你生成字符串，而是帮你生成可以直接传给聊天模型的消息数组。

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

// 创建 ChatPromptTemplate。
//
// fromMessages 接收一个消息模板数组。
// 每一项通常是 [role, template]：
// - role 表示消息角色，比如 'system'、'human'
// - template 是这个角色下的提示词模板，可以继续使用 {变量名}
const chatPrompt = ChatPromptTemplate.fromMessages([

    // system 消息：负责告诉模型“你是谁、你应该按什么风格工作”。
    //
    // 这里把写作风格 {tone} 放到 system 里，
    // 因为风格要求属于全局规则，而不是用户数据本身。
    [
        'system',
    `你是一名资深工程团队负责人，擅长用结构化、易读的方式写技术周报。
写作风格要求：{tone}。

请根据后续用户提供的信息，帮他生成一份适合给老板和团队同时抄送的周报草稿。`,
    ],

    // human 消息：负责承载这次具体任务的数据。
    //
    // 这里放公司、团队、时间范围、目标、开发活动和输出要求。
    // 它更像用户真正发给 AI 的那一段请求。
    [
        'human',
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
])


// formatMessages 会把模板里的变量替换成真实值，
// 并返回真正的消息数组。
//
// 和 PromptTemplate.format() 的区别：
// - format() 返回字符串
// - formatMessages() 返回 [SystemMessage, HumanMessage, ...]
const chatMessages = await chatPrompt.formatMessages({
    // 替换 system 消息里的 {tone}。
    tone: '专业、清晰、略带鼓励',

    // 替换 human 消息里的各个业务变量。
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

// 打印 ChatPromptTemplate 生成的消息数组。
// 学习时建议重点看这里：
// 你会看到它不是一个字符串，而是 SystemMessage + HumanMessage。
console.log('ChatPromptTemplate 生成的消息:');
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

    // 直接把消息数组传给聊天模型。
    //
    // 这就是 ChatPromptTemplate 的使用方式：
    // 它帮我们生成 messages，model.invoke(messages) 再发给模型。
    const response = await model.invoke(chatMessages);

    console.log('\nAI 生成的周报草稿::');

    // invoke 返回完整 AIMessage，真正的文本内容在 response.content。
    console.log(response.content);
}catch (error) {
    // 常见错误场景：
    // 1. .env 配置不正确，导致模型调用失败
    // 2. ChatPromptTemplate 里的变量没有全部传入
    // 3. messages 结构不符合模型或服务商要求
    console.error("❌ 错误:", error.message);
}
