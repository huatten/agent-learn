// ========== 【LangChain 聊天历史记忆示例 - 内存存储】 ==========
// 本示例演示如何使用 InMemoryChatMessageHistory 在内存中存储对话历史
// 适用场景：单会话的测试和演示，程序重启后记忆会丢失
// 核心作用：让 AI 能够"记住"之前的对话内容，实现多轮连贯对话

// ========== 1. 导入依赖 ==========
// 加载环境变量，从 .env 文件读取配置到 process.env
import "dotenv/config";
// 从 LangChain 导入 OpenAI 聊天模型封装
import { ChatOpenAI } from "@langchain/openai";
// InMemoryChatMessageHistory: 在内存中存储聊天消息历史
// 优点：简单快速；缺点：程序退出数据丢失
import { InMemoryChatMessageHistory } from "@langchain/core/chat_history";
// 消息类型：用户消息、系统消息
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// ========== 2. 初始化大语言模型 ==========
// 创建聊天模型实例，兼容所有 OpenAI 格式接口
const model = new ChatOpenAI({
    // 模型名称从环境变量读取
    model: process.env.MODEL_NAME,
    // API 密钥从环境变量读取，用于身份认证
    apiKey: process.env.OPENAI_API_KEY,
    // 温度设为 0 让输出更确定性，减少随机性
    temperature: 0,
    // 第三方兼容接口需要配置自定义 baseURL
    configuration:{
        baseURL: process.env.OPENAI_API_BASE_URL,
    }
});

// ========== 3. 内存存储对话演示 ==========
const inMemoryDemo = async() => {
    // 创建一个内存存储的聊天历史实例
    // 所有消息都会存储在进程内存中
    const chatHistory = new InMemoryChatMessageHistory();

    // 创建系统提示词，定义 AI 的角色和行为
    const systemMessage = new SystemMessage("你是一个友好、幽默的做菜助手，喜欢分享美食和烹饪技巧。");

    // ---------- 第一轮对话 ----------
    console.log("[-----开始第一轮对话-----]");
    // 创建用户消息
    const userMessage_1 = new HumanMessage("你今天吃什么？");
    // 将用户消息添加到历史记录中
    await chatHistory.addMessage(userMessage_1);

    // 构建完整消息列表：系统提示词 + 所有历史消息
    const message_1 = [systemMessage, ...(await chatHistory.getMessages())];
    // 调用大模型获取回复
    const response_1 = await model.invoke(message_1);
    // 将 AI 回复也添加到历史记录中
    await chatHistory.addMessage(response_1);
    // 打印对话内容
    console.log(`用户:${userMessage_1.content}`);
    console.log(`助手:${response_1.content}\n`);

    // ---------- 第二轮对话 ----------
    // 由于第一轮已经保存了对话历史，AI 能理解"好吃吗？"是在问之前提到的食物
    console.log("[-----开始第二轮对话 - 基于历史记录-----]");
    const userMessage_2 = new HumanMessage("好吃吗？");
    await chatHistory.addMessage(userMessage_2);
    // 消息包含了前两轮所有内容，AI 记得上下文
    const message_2 = [systemMessage, ...(await chatHistory.getMessages())];
    const response_2 = await model.invoke(message_2);
    await chatHistory.addMessage(response_2);
    console.log(`用户:${userMessage_2.content}`);
    console.log(`助手:${response_2.content}\n`);

    // ---------- 查看所有历史消息 ----------
    // 验证我们保存了多少消息
    console.log("[-----历史消息记录-----]");
    const allMessages = await chatHistory.getMessages();
    console.log(`共保存了${allMessages.length}条消息：`);
    allMessages.forEach((message, index) => {
        const type = message.type;
        const prefix = type === "human" ? "用户" : "助手";
        console.log(` ${index + 1}. [${prefix}]: ${message.content.substring(0, 60)}...`);
    });
};

try {
    await inMemoryDemo();
} catch (error) {
    console.log("出错了", error);
}
