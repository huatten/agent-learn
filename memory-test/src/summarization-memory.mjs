// ========== 【对话记忆总结示例 - 按消息数量触发】 ==========
// 总结式记忆管理策略：
// 当对话历史过长时，不直接截断丢弃，而是让 AI 先总结旧对话的核心内容
// 这样既能控制上下文长度，又能保留对话的关键信息，比简单截断更智能
//
// 本示例：按消息数量触发总结，超过指定消息条数就触发总结

// ========== 1. 导入依赖 ==========
// 加载环境变量
import "dotenv/config";
// 导入 OpenAI 聊天模型封装
import { ChatOpenAI } from "@langchain/openai";
// 内存聊天历史存储
import { InMemoryChatMessageHistory } from "@langchain/core/chat_history";
// 消息类型 + getBufferString：将消息数组转换成格式化字符串
import { HumanMessage, SystemMessage, AIMessage, getBufferString } from "@langchain/core/messages";

// ========== 2. 初始化大语言模型 ==========
// 我们用同一个模型做对话和总结
const model = new ChatOpenAI({
    model: process.env.MODEL_NAME,
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
    configuration: {
        baseURL: process.env.OPENAI_API_BASE_URL,
    }
});

// ========== 3. 总结策略演示（按消息数量） ==========
const summarizationMemoryDemo = async () => {
    // 创建内存聊天历史存储
    const history = new InMemoryChatMessageHistory();
    // 触发总结的阈值：当消息数 >= 6 时触发总结
    const maxMessages = 6;

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

    // 获取全部消息
    let allMessages = await history.getMessages();

    // 打印原始消息信息
    console.log(`原始消息数量: ${allMessages.length}`);
    console.log("原始消息:", allMessages.map(m => `${m.constructor.name}: ${m.content}`).join('\n  '));

    // ---------- 判断是否需要总结 ----------
    // 如果消息数量超过阈值，触发总结流程
    if (allMessages.length >= maxMessages) {
        // 需要保留的最近消息条数：最新的 2 条消息直接保留，不参与总结
        const keepRecent = 2;

        // 分离消息：
        // - recentMessages: 最近 N 条消息，直接保留，不总结
        // - messageToSummarize: 更早的旧消息，需要被总结
        const recentMessages = allMessages.slice(-keepRecent);
        const messageToSummarize = allMessages.slice(0, -keepRecent);
        console.log(`\n 💡[------历史消息过多，开始总结------]`);
        console.log(`📝 将被保留的消息数量: ${recentMessages.length}`);
        console.log(`📝 将被总结的消息数量: ${messageToSummarize.length}`);

        // 调用大模型对旧消息进行总结
        const summary = await summarizeHistory(messageToSummarize);

        // 清空原有历史，重建：只保留最新消息 + 总结（实际应用中总结也要放进去）
        await history.clear();
        for (const msg of recentMessages) {
            await history.addMessage(msg);
        }

        // 打印结果
        console.log(`\n 保留消息数量: ${recentMessages.length}`);
        console.log("保留的消息:", recentMessages.map(m => `${m.constructor.name}: ${m.content}`).join('\n  '));
        console.log(`\n AI总结内容（不包含保留的消息）: ${summary}`);

    } else {
        // 没超过阈值，不需要总结
        console.log(`\n 💡[------历史消息数量正常，不需要总结------]`);
    }
};

// ========== 工具函数：总结历史对话 ==========
// 让大模型把一段对话总结成一段核心文字
// messages: 需要总结的对话历史数组
const summarizeHistory = async (messages) => {
    // 没有消息需要总结，返回空字符串
    if (messages.length <= 0) return "";
    // getBufferString 将消息数组格式化为易读的对话文本
    // 方便 AI 阅读，指定用户和 AI 的前缀
    const conversationText = getBufferString(messages, {
        humanPrefix: "用户",
        aiPrefix: "AI助手",
    });
    // 构造总结 Prompt：让 AI 总结核心内容，保留重要信息
    const summaryPrompt = `请总结以下对话的核心内容，保留重要信息：\n${conversationText}\n 总结：`;
    // 调用大模型生成总结
    const summaryResponse = await model.invoke([new SystemMessage(summaryPrompt)]);
    // 返回总结内容
    return summaryResponse.content;
};

// ========== 执行演示 ==========
try {
    await summarizationMemoryDemo();
} catch (e) {
    console.log(e);
}
