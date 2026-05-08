// ========== 【LangChain 聊天历史记忆示例 - 文件存储】 ==========
// 本示例演示如何使用 FileSystemChatMessageHistory 从头开始
// 将多轮对话保存到本地文件，实现持久化存储
// 运行完这个示例后，再运行 history-test2.mjs 就能验证恢复功能

// ========== 1. 导入依赖 ==========
// 加载环境变量
import "dotenv/config";
// 导入 OpenAI 聊天模型封装
import { ChatOpenAI } from "@langchain/openai";
// FileSystemChatMessageHistory: 将聊天历史持久化到本地 JSON 文件
// LangChain 社区提供的开箱即用文件存储方案
import { FileSystemChatMessageHistory } from "@langchain/community/stores/message/file_system";
// 消息类型
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
// Node.js path 模块处理文件路径
import path from "node:path";

// ========== 2. 初始化大语言模型 ==========
const model = new ChatOpenAI({
    model: process.env.MODEL_NAME,
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
    configuration: {
        baseURL: process.env.OPENAI_API_BASE_URL,
    }
});

// ========== 3. 文件存储对话演示（从头开始保存） ==========
const fileHistoryDemo = async () => {
    // 指定存储历史记录的文件路径
    const filePath = path.join(process.cwd(), "chat_history.json");
    // 会话 ID：同一个文件可以存储多个不同会话，用 ID 区分
    const sessionId = "user_session_001";

    // 系统提示词，定义 AI 为做菜助手
    const systemMessage = new SystemMessage("你是一个友好、幽默的做菜助手，喜欢分享美食和烹饪技巧。");

    // ---------- 第一轮对话 ----------
    console.log("[-----开始第一轮对话-----]");
    // 创建文件存储实例，会自动创建文件（如果不存在）
    const chatHistory = new FileSystemChatMessageHistory({
        sessionId,
        filePath,
    });

    // 用户提问：如何做红烧肉
    const userMessage_1 = new HumanMessage("红烧肉怎么做？");
    // 添加到历史记录，自动写入文件
    await chatHistory.addMessage(userMessage_1);

    // 构建消息列表并调用模型
    const message_1 = [systemMessage, ...(await chatHistory.getMessages())];
    const response_1 = await model.invoke(message_1);
    // AI 回复也添加到历史，自动保存到文件
    await chatHistory.addMessage(response_1);

    // 打印对话
    console.log(`用户:${userMessage_1.content}`);
    console.log(`助手:${response_1.content}\n`);
    console.log(`✓ 对话已保存到文件: ${filePath}\n`);

    // ---------- 第二轮对话 ----------
    // 基于已保存的历史记录继续聊天，AI 记得在说红烧肉
    console.log("[-----开始第二轮对话 - 基于历史记录-----]");
    const userMessage_2 = new HumanMessage("好吃吗？");
    await chatHistory.addMessage(userMessage_2);
    const message_2 = [systemMessage, ...(await chatHistory.getMessages())];
    const response_2 = await model.invoke(message_2);
    await chatHistory.addMessage(response_2);

    console.log(`用户:${userMessage_2.content}`);
    console.log(`助手:${response_2.content}\n`);
    console.log(`✓ 对话已更新到文件\n`);
};

try {
    await fileHistoryDemo();
} catch (error) {
    console.log("出错了", error);
}
