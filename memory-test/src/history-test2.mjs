// ========== 【LangChain 聊天历史记忆示例 - 文件存储】 ==========
// 本示例演示如何使用 FileSystemChatMessageHistory 将对话历史持久化到文件
// 这是基于 history-test3.mjs 的续写演示，用于验证：
// 1. 程序重启后能从文件恢复历史记录
// 2. 继续在已有历史上进行新的对话，保持上下文连贯性

// ========== 1. 导入依赖 ==========
// 加载环境变量
import "dotenv/config";
// 导入 OpenAI 聊天模型封装
import { ChatOpenAI } from "@langchain/openai";
// FileSystemChatMessageHistory: 将聊天历史持久化到本地 JSON 文件
// 优点：数据持久化，程序重启不丢失；适合开发调试和小规模数据
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

// ========== 3. 文件存储对话演示（恢复 + 续写） ==========
const fileHistoryDemo = async () => {
    // 指定存储历史记录的文件路径
    // 这里使用项目根目录下的 chat_history.json
    const filePath = path.join(process.cwd(), "chat_history.json");
    // 会话 ID：区分不同用户的会话，同一个文件中可以存储多个会话
    const sessionId = "user_session_001";

    // 系统提示词，定义 AI 角色
    const systemMessage = new SystemMessage("你是一个友好、幽默的做菜助手，喜欢分享美食和烹饪技巧。");

    // 创建文件存储的聊天历史实例
    // 它会自动从文件读取已有历史记录
    const restoredHistory = new FileSystemChatMessageHistory({
        sessionId,
        filePath,
    });

    // 从文件恢复历史消息
    const restoredMessages = await restoredHistory.getMessages();
    console.log(`从文件恢复了 ${restoredMessages.length} 条历史消息`);

    // 打印恢复出的历史消息，让我们看看之前保存了什么
    restoredMessages.forEach((msg, index) => {
        const type = msg.type;
        const prefix = type === 'human' ? '用户' : '助手';
        console.log(`  ${index + 1}. [${prefix}]: ${msg.content.substring(0, 60)}...`);
    });

    // ---------- 第三轮对话（基于恢复的历史继续聊天） ----------
    console.log("[------第三轮对话------]");
    // 继续之前的话题，问红烧肉需要什么食材
    // AI 记得我们正在讨论红烧肉，因为历史已经恢复了
    const userMessage_3 = new HumanMessage(
        "需要哪些食材？"
    );
    // 添加用户消息到历史
    await restoredHistory.addMessage(userMessage_3);
    // 构建消息列表：系统提示词 + 恢复的历史 + 新消息
    const message_3 = [systemMessage, ...(await restoredHistory.getMessages())];
    // 调用模型
    const response_3 = await model.invoke(message_3);
    // AI 回复也会自动保存到文件
    await restoredHistory.addMessage(response_3);

    // 打印结果
    console.log(`用户: ${userMessage_3.content}`);
    console.log(`助手: ${response_3.content}`);
    console.log(`✓ 对话已保存到文件\n`);
};

try {
    await fileHistoryDemo();
} catch (error) {
    console.log("出错了", error);
}
