import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";

// 这个文件演示的是 MessagesPlaceholder。
//
// 前面我们学了 ChatPromptTemplate，它可以生成 messages 数组。
// 普通的 input variables，比如 {current_input}，适合填入字符串、数字这类普通值。
//
// 但有一种情况不一样：
// 如果我们想插入“一整段聊天记录”，例如：
// - HumanMessage
// - AIMessage
// - HumanMessage
// - AIMessage
//
// 那就不能只用普通的 {history} 字符串占位符。
// 因为历史对话不是一个字符串，而是一组带角色的消息。
//
// 这时就要用 MessagesPlaceholder。
// 它的作用是：在 ChatPromptTemplate 的某个位置，插入一整段 messages。

// 创建聊天模型实例。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称。
    model: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    apiKey: process.env.OPENAI_API_KEY,

    // 建议类任务希望输出稳定，所以设置为 0。
    temperature: 0,

    configuration: {
        // OPENAI_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 定义一个包含 MessagesPlaceholder 的 ChatPromptTemplate。
//
// 最终消息顺序会是：
// 1. system 消息：设定 AI 角色
// 2. history：插入历史对话消息数组
// 3. human 消息：本轮用户的新问题
const chatPromptWithHistory = ChatPromptTemplate.fromMessages([
    // system 消息：定义助手身份和回答风格。
    [
        "system",
        `你是一名资深工程效率顾问，善于在多轮对话的上下文中给出具体、可执行的建议。`,
    ],

    // 这里用 MessagesPlaceholder 来注入对话历史。
    //
    // "history" 是变量名。
    // 后面 formatPromptValue({ history: historyMessages }) 时，
    // historyMessages 会被原样插入到这个位置。
    //
    // 注意：history 应该是一组消息，而不是普通字符串。
    new MessagesPlaceholder("history"),

    // 当前这一轮的新问题。
    // {current_input} 仍然是普通字符串变量，用常规占位符就可以。
    [
        'human',
        `这是用户本轮的新问题：{current_input}

请结合上面的历史对话，一并给出你的建议。`,
    ]
]);

// 构造一段模拟的历史对话。
//
// 这里使用的是简化写法：{ role, content }。
// LangChain 会根据 role 把它们转成对应的 HumanMessage / AIMessage。
//
// 这段 history 会插入到 MessagesPlaceholder("history") 的位置。
const historyMessages = [
    // 第一轮用户消息。
    {
        role: 'human',
        content: '我们团队最近在做一个内部的周报自动生成工具。',
    },

    // 第一轮 AI 回复。
    {
        role: 'ai',
        content:
            '听起来不错，可以先把数据源（Git / Jira / 运维）梳理清楚，再考虑 Prompt 模块化设计。',
    },

    // 第二轮用户消息。
    {
        role: 'human',
        content: '我们已经把 Prompt 拆成了「人设」「背景」「任务」「格式」四块。',
    },

    // 第二轮 AI 回复。
    {
        role: 'ai',
        content:
            '很好，接下来可以考虑把这些模块做成可复用的 PipelinePromptTemplate，方便在不同场景复用。',
    },
]

// 格式化 prompt。
//
// 注意这里用 formatPromptValue，而不是单纯 formatMessages。
// formatPromptValue 返回的是一个 PromptValue，
// 后面可以通过 toChatMessages() 查看最终消息数组。
const formattedMessages = await chatPromptWithHistory.formatPromptValue({
    // 这里填的是一整段历史消息数组，会插入 MessagesPlaceholder。
    history: historyMessages,

    // 这里填的是普通字符串，会替换 {current_input}。
    current_input: '现在我们想再优化一下多人协同编辑周报的流程，有什么建议？',
})

// 打印最终消息数组。
// 重点观察：
// system 后面不是一个 history 字符串，
// 而是真的插入了多条 HumanMessage / AIMessage。
console.log('包含历史对话的消息数组：');
console.log(formattedMessages.toChatMessages());

//  输出如下：

// [
//     SystemMessage {
//     "content": "你是一名资深工程效率顾问，善于在多轮对话的上下文中给出具体、可执行的建议。",
//     "additional_kwargs": {},
//     "response_metadata": {}
// },
//     HumanMessage {
//     "content": "我们团队最近在做一个内部的周报自动生成工具。",
//     "additional_kwargs": {},
//     "response_metadata": {}
// },
//     AIMessage {
//     "content": "听起来不错，可以先把数据源（Git / Jira / 运维）梳理清楚，再考虑 Prompt 模块化设计。",
//     "additional_kwargs": {},
//     "response_metadata": {},
//     "tool_calls": [],
//     "invalid_tool_calls": []
// },
//     HumanMessage {
//     "content": "我们已经把 Prompt 拆成了「人设」「背景」「任务」「格式」四块。",
//     "additional_kwargs": {},
//     "response_metadata": {}
// },
//     AIMessage {
//     "content": "很好，接下来可以考虑把这些模块做成可复用的 PipelinePromptTemplate，方便在不同场景复用。",
//     "additional_kwargs": {},
//     "response_metadata": {},
//     "tool_calls": [],
//     "invalid_tool_calls": []
// },
//     HumanMessage {
//     "content": "这是用户本轮的新问题：现在我们想再优化一下多人协同编辑周报的流程，有什么建议？\n\n请结合上面的历史对话，一并给出你的建议。",
//     "additional_kwargs": {},
//     "response_metadata": {}
// }
// ]


try {
    console.log("🤔 正在调用大模型...\n");

    // 把包含历史对话的 PromptValue 传给模型。
    // 模型会同时看到：
    // - system 角色设定
    // - 之前几轮历史对话
    // - 当前用户的新问题
    const response = await model.invoke(formattedMessages);

    console.log('\nAI 生成的回复:');

    // response 是 AIMessage，真正文本在 response.content。
    console.log(response.content);
}catch (error) {
    // 常见错误场景：
    // 1. .env 配置不正确，导致模型调用失败
    // 2. MessagesPlaceholder 对应的 history 没传，或者传的不是消息数组
    // 3. history 里的 role 写错，导致无法转换成合法消息
    console.error("❌ 错误:", error.message);
}
