// ========== 【对话记忆总结示例 - 按 token 数量触发】 ==========
// 总结式记忆管理策略的改进版本：
// - 不是按消息数量，而是按实际 token 数量判断是否触发总结
// - 动态计算保留最近多少消息，直到达到 token 配额
// - 更精确地控制最终上下文长度不超过限制
//
// 和简单截断相比，总结能保留更多有用信息

// ========== 1. 导入依赖 ==========
// 加载环境变量
import "dotenv/config";
// 导入 OpenAI 聊天模型封装
import { ChatOpenAI } from "@langchain/openai";
// 内存聊天历史存储
import { InMemoryChatMessageHistory } from "@langchain/core/chat_history";
// 消息类型 + getBufferString：格式化对话文本
import { HumanMessage, SystemMessage, AIMessage, getBufferString } from "@langchain/core/messages";
// js-tiktoken：准确计算 token 数量
import { getEncoding } from "js-tiktoken";

// ========== 2. 初始化大语言模型 ==========
const model = new ChatOpenAI({
    model: process.env.MODEL_NAME,
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
    configuration: {
        baseURL: process.env.OPENAI_API_BASE_URL,
    }
});

// ========== 3. 总结策略演示（按 token 数量） ==========
const summarizationMemoryDemo = async () => {
    // 创建内存聊天历史存储
    const history = new InMemoryChatMessageHistory();
    // 触发总结的 token 阈值：超过 200 token 就触发总结
    const maxTokens = 200;
    // 总结后需要保留最近多少 token 的消息直接保留（不参与总结）
    // 通常保留总配额的 30-40% 给最新消息
    const keepRecentTokens = 80;

    // 获取 token 编码器（OpenAI 系列模型用 cl100k_base）
    const enc = getEncoding("cl100k_base");

    // 模拟关于红烧肉做法的多轮对话
    const messages = [
        { type: 'human', content: '我想学做红烧肉，你能教我吗？' },
        { type: 'ai', content: '当然可以！红烧肉是一道经典的中式菜肴。首先需要准备五花肉、冰糖、生抽、老抽、料酒等材料。' },
        { type: 'human', content: '五花肉需要切多大块？' },
        { type: 'ai', content: '建议切成3-4厘米见方的块，这样既容易入味，口感也更好。切好后可以用开水焯一下去除血沫。' },
        { type: 'human', content: '炒糖色的时候有什么技巧吗？' },
        { type: 'ai', content: '炒糖色是关键步骤。用小火慢慢炒，等冰糖完全融化变成焦糖色，冒小泡时就可以下肉了。注意不要炒过头，否则会发苦。' },
        { type: 'human', content: '需要炖多长时间？' },
        { type: 'ai', content: '一般需要炖40-60分钟，用小火慢炖，直到肉变得软糯入味。可以用筷子戳一下，能轻松戳透就说明好了。' },
        { type: 'human', content: '最后收汁的时候要注意什么？' },
        { type: 'ai', content: '收汁时要用大火，不断翻动，让汤汁均匀包裹在肉块上。看到汤汁变得浓稠，颜色红亮就可以出锅了。' },
    ];

    // 将所有消息添加到历史存储中
    for (const msg of messages) {
        if (msg.type === 'human') {
            await history.addMessage(new HumanMessage(msg.content));
        } else {
            await history.addMessage(new AIMessage(msg.content));
        }
    }

    // 获取全部消息，计算总 token 数
    let allMessages = await history.getMessages();
    const totalTokens = countTokens(allMessages, enc);

    // 打印原始信息
    console.log(`原始消息数量: ${allMessages.length}`);
    console.log(`原始消息 tokens 数量: ${totalTokens}`);
    console.log("原始消息:", allMessages.map(m => `${m.constructor.name}: ${m.content}`).join('\n  '));

    // ---------- 判断是否需要总结 ----------
    if (totalTokens >= maxTokens) {
        // 从后往前累加，收集最近的消息直到达到 keepRecentTokens
        // 这样能保证保留最新对话，且不超过 token 配额
        const recentMessages = [];
        let recentTokens = 0;
        for (let i = allMessages.length - 1; i >= 0; i--) {
            const msg = allMessages[i];
            const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            const msgTokens = enc.encode(content).length;
            // 如果加上这条消息还不超过配额，就保留它
            if (recentTokens + msgTokens <= keepRecentTokens) {
                recentMessages.unshift(msg);
                recentTokens += msgTokens;
            } else {
                // 超过配额就停止，前面的消息都需要总结
                break;
            }
        }
        // 计算需要总结的消息
        const messagesToSummarize = allMessages.slice(0, allMessages.length - recentMessages.length);
        const summarizeTokens = countTokens(messagesToSummarize, enc);

        console.log("\n💡 Token 数量超过阈值，开始总结...");
        console.log(`📝 将被总结的消息数量: ${messagesToSummarize.length} (${summarizeTokens} tokens)`);
        console.log(`📝 将被保留的消息数量: ${recentMessages.length} (${recentTokens} tokens)`);

        // 调用大模型对旧消息进行总结
        const summary = await summarizeHistory(messagesToSummarize);

        // 清空原有历史，只保留最近消息（实际应用中需要把总结也加回去）
        await history.clear();
        for (const msg of recentMessages) {
            await history.addMessage(msg);
        }

        // 打印结果
        console.log(`\n保留消息数量: ${recentMessages.length}`);
        console.log("保留的消息:", recentMessages.map(m => {
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            const tokens = enc.encode(content).length;
            return `${m.constructor.name} (${tokens} tokens): ${m.content}`;
        }).join('\n  '));
        console.log(`\n总结内容（不包含保留的消息）: ${summary}`);

    } else {
        // 没超过 token 阈值，不需要总结
        console.log(`\nToken 数量 (${totalTokens}) 未超过阈值 (${maxTokens})，无需总结`);
    }
};

// ========== 工具函数：计算总 token 数量 ==========
// 统计消息数组的总 token 数，处理非字符串内容（如多模态）
const countTokens = (messages, encoder) => {
    let tokenCount = 0;
    for (const message of messages) {
        // 如果 content 不是字符串，转成 JSON 再计算
        const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
        tokenCount += encoder.encode(content).length;
    }
    return tokenCount;
};

// ========== 工具函数：总结历史对话 ==========
// 让大模型总结一段对话的核心内容
const summarizeHistory = async (messages) => {
    if (messages.length <= 0) return "";
    // 格式化为易读的对话文本
    const conversationText = getBufferString(messages, {
        humanPrefix: "用户",
        aiPrefix: "AI助手",
    });
    // 构造总结 Prompt
    const summaryPrompt = `请总结以下对话的核心内容，保留重要信息：\n${conversationText}\n 总结：`;
    // 调用大模型生成总结
    const summaryResponse = await model.invoke([new SystemMessage(summaryPrompt)]);
    return summaryResponse.content;
};

// ========== 执行演示 ==========
try {
    await summarizationMemoryDemo();
} catch (e) {
    console.log(e);
}
