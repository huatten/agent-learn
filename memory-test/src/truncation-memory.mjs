// ========== 【LangChain 对话记忆截断示例】 ==========
// 长时间对话会积累大量历史消息，导致 token 超限
// 本示例演示两种常见的截断策略来控制上下文长度：
// 1. 按消息数量截断：只保留最近 N 条消息
// 2. 按 token 数量截断：使用 LangChain 内置的 trimMessages API

// ========== 1. 导入依赖 ==========
// 内存聊天历史存储
import { InMemoryChatMessageHistory } from "@langchain/core/chat_history";
// HumanMessage: 用户消息，AIMessage: AI 回复，trimMessages: LangChain 内置截断工具
import { HumanMessage, AIMessage, trimMessages } from "@langchain/core/messages";
// js-tiktoken：用于准确计算 OpenAI 格式的 token 数量
import { getEncoding } from "js-tiktoken";

// ========== 2. 方案一：按消息数量截断 ==========
// 最简单的策略：只保留最近 N 条对话
// 优点：实现简单，容易理解；缺点：不考虑单条消息长度差异
const trimMessagesByMessageCount = async () => {
    // 创建内存聊天历史
    const history = new InMemoryChatMessageHistory();
    // 最大保留消息数量：这里设置保留最近 4 条
    const maxMessagesCount = 4;

    // 模拟多轮对话历史（共 11 条消息，用户 + AI 交替）
    const messages = [
        { type: "human", content: "我叫张三"},
        { type: "ai", content: "你好张三，很高兴认识你！"},
        { type: "human", content: "我今年25岁"},
        { type: "ai", content: "25岁正是青春年华，有什么我可以帮助你的吗？"},
        { type: "human", content: "我喜欢编程"},
        { type: "ai", content: " programming 是一个很棒的技能，你主要用什么语言？"},
        { type: "human", content: "我主要用JavaScript"},
        { type: "ai", content: " JavaScript 是一个很棒的语言，你喜欢它的原因是什么？"},
        { type: "human", content: " JavaScript 是一个动态语言，它具有动态类型和弱类型，因此它很容易进行动态编程。"},
        { type: "ai", content: " 明白了，你现在在哪里编程？主要做什么？"},
        { type: "human", content: "我主要在武汉编程，在写JavaScript代码和学习Agent开发"},
    ];

    // 将所有消息添加到历史存储中
    for (const message of messages) {
        const { type, content } = message;
        if (type === "human") {
            await history.addMessage(new HumanMessage(content));
        } else if (type === "ai") {
            await history.addMessage(new AIMessage(content));
        }
    }

    // 获取全部消息
    let allMessages = await history.getMessages();

    // 按消息数量截断：使用数组 slice 只保留最后 maxMessagesCount 条
    const trimmedMessages = allMessages.slice(-maxMessagesCount);
    console.log("------按照消息数量截断------");
    console.log(`保留消息数量: ${trimmedMessages.length}`);
    console.log("保留的消息:", trimmedMessages.map(m => `${m.constructor.name}: ${m.content}`).join('\n  '));
};

// ========== 工具函数：计算总 token 数量 ==========
// 统计整个消息数组包含了多少个 token
// encoder: js-tiktoken 的编码器实例
const countTokens = (messages, encoder) => {
    let tokenCount = 0;
    for (const message of messages) {
        // 如果 content 不是字符串（比如多模态内容），转成 JSON 再计算
        const content =  typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
        tokenCount += encoder.encode(content).length;
    }
    return tokenCount;
};

// ========== 3. 方案二：按照 token 数量截断 ==========
// 更精确的策略：控制总 token 数不超过指定上限
// 使用 LangChain 内置的 trimMessages 工具自动截断
const trimMessagesByTokenCount = async () => {
    // 创建内存聊天历史
    const history = new InMemoryChatMessageHistory();
    // 最大 token 数上限：这里设置 100 token
    const maxTokens = 100;
    // 获取编码器，cl100k_base 是 gpt-3.5/gpt-4 使用的编码
    const enc = getEncoding("cl100k_base");

    // 模拟多轮对话历史
    const messages = [
        { type: "human", content: "我叫李四"},
        { type: "ai", content: "你好李四，很高兴认识你！"},
        { type: "human", content: "我是一名设计师"},
        { type: "ai", content: "你是一个很棒的设计师，你喜欢什么？"},
        { type: "human", content: "我喜欢设计"},
        { type: "ai", content: " 艺术和音乐都是很好的爱好，它们能激发创作灵感。"},
        { type: "human", content: "我擅长 UI/UX 设计"},
        { type: "ai", content: " UI/UX 设计是一个很棒的技能，你喜欢它的原因是什么？"},
        { type: "human", content: " UI/UX 设计是一个很棒的技能，因为它可以提高产品的用户体验。"},
    ];

    // 将所有消息添加到历史存储
    for (const message of messages) {
        const { type, content } = message;
        if (type === "human") {
            await history.addMessage(new HumanMessage(content));
        } else if (type === "ai") {
            await history.addMessage(new AIMessage(content));
        }
    }

    // 获取全部消息
    let allMessages = await history.getMessages();

    // 使用 LangChain trimMessages API 进行截断
    // 它会自动从最早的消息开始删除，直到总 token 数低于上限
    const trimmedMessages = await trimMessages(allMessages, {
        maxTokens: maxTokens,         // 目标最大 token 数
        tokenCounter: (text) => countTokens(text, enc),  // 自定义 token 计算器
        strategy: "last",             // 策略：保留最近的消息，删除最早的
    });

    // 统计并打印结果
    const totalTokens = countTokens(allMessages, enc);
    console.log("\n------按照token数量截断------");
    console.log(`总 token 数: ${totalTokens}/${maxTokens}`);
    console.log(`保留消息数量: ${trimmedMessages.length}`);
    console.log("保留的消息:", trimmedMessages.map(m => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        const tokens = enc.encode(content).length;
        return `${m.constructor.name} (${tokens} tokens): ${content}`;
    }).join('\n  '));
};

// ========== 执行两个演示 ==========
try {
    await trimMessagesByMessageCount();
    await trimMessagesByTokenCount();
} catch (e) {
    console.log(e);
}
