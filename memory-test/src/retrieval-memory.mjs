// ========== 【检索式记忆示例 - Milvus 向量数据库】 ==========
// 策略3：检索式记忆（Retrieval-Based Memory）
// 核心思想：
// - 把所有历史对话都存储在向量数据库中
// - 每次用户提问时，只检索出和当前问题语义相关的历史对话
// - 将检索到的相关历史作为上下文给 AI，让 AI 回答
// 优势：
// - 能处理非常长的对话，不会导致 token 超限
// - 只引入相关的历史，减少噪音
// - 支持长期记忆，几个月前的对话只要相关就能检索出来
//
// 本示例使用 Milvus 向量数据库存储对话向量

// ========== 1. 导入依赖 ==========
// 加载环境变量
import "dotenv/config";
// Milvus 节点 SDK：Milvus 是开源向量数据库
// DataType, MetricType, IndexType: Milvus 数据类型和配置常量
import { MilvusClient, DataType, MetricType, IndexType } from "@zilliz/milvus2-sdk-node";
// LangChain 封装：OpenAI 聊天模型 + OpenAI 嵌入模型
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
// 内存聊天历史存储（存储当前会话）
import { InMemoryChatMessageHistory } from "@langchain/core/chat_history";
// 消息类型
import { HumanMessage, SystemMessage} from "@langchain/core/messages";

// ========== 2. 常量配置 ==========
// Milvus 集合名称：存储对话记忆的表名
const COLLECTION_NAME = 'conversations';
// 向量维度：和嵌入模型输出维度一致
const VECTOR_DIMENSION = 1024;
// Milvus 服务地址，默认本地运行
const MILVUS_ADDRESS = 'localhost:19530';

// ========== 3. 初始化模型和客户端 ==========
// 初始化大语言模型，用于生成回答
const model = new ChatOpenAI({
    model: process.env.MODEL_NAME,
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
    configuration: {
        baseURL: process.env.OPENAI_API_BASE_URL,
    }
});

// 初始化嵌入模型，用于将文本转换为向量
// 每个对话都会生成向量存入 Milvus
const embeddings = new OpenAIEmbeddings({
    model: process.env.EMBEDDINGS_MODEL_NAME,
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
        baseURL: process.env.OPENAI_API_BASE_URL,
    },
    dimensions: VECTOR_DIMENSION,
});

// 创建 Milvus 客户端连接
const client = new MilvusClient({
    address: MILVUS_ADDRESS
});

// ========== 工具函数：获取文本的嵌入向量 ==========
// 将一段文本转换为向量表示，用于存储或检索
const getEmbedding = async (text) => {
    const embedding = await embeddings.embedQuery(text);
    return embedding;
};

// ========== 核心函数：从 Milvus 检索相关历史对话 ==========
// query: 当前用户的问题，用它来检索相关历史
// k: 返回最相关的 top k 条结果
const retrieveRelevantConversations = async (query, k = 2) => {
    try {
        // 对查询生成向量嵌入
        const queryVector = await getEmbedding(query);

        // 在 Milvus 中进行相似度搜索
        // 找出来和查询向量余弦相似度最近的 k 条对话
        const searchResult = await client.search({
            collection_name: COLLECTION_NAME,
            vector: queryVector,
            limit: k,
            metric_type: MetricType.COSINE,  // 使用余弦相似度
            output_fields: ['id', 'content', 'round', 'timestamp']  // 需要返回哪些字段
        });
        return searchResult.results;
    } catch (e) {
        console.log('检索对话时出错:', e.message);
        return [];
    }
};

// ========== 4. 检索式记忆演示 ==========
const retrievalMemoryDemo = async () => {
    try {
        console.log('连接到 Milvus...');
        // 等待 Milvus 连接完成
        await client.connectPromise;
        console.log('✓ 已连接\n');
    } catch (error) {
        console.error('❌ 无法连接到 Milvus:', error.message);
        console.log('请确保 Milvus 服务正在运行（localhost:19530）');
        return;
    }

    // 创建当前会话的内存历史存储
    const chatHistory = new InMemoryChatMessageHistory();

    // 模拟三轮用户提问，用于演示：
    // 这三个问题都需要参考之前说过的内容才能正确回答
    const conversations = [
        { input: "我之前提到的机器学习项目进展如何？" },
        { input: "我周末经常做什么？" },
        { input: "我的职业是什么？" },
    ];

    // 遍历每一轮对话
    for (let i = 0; i < conversations.length; i++) {
        const { input } = conversations[i];
        const userMessage = new HumanMessage(input);
        console.log(`\n[第 ${i + 1} 轮对话]`);
        console.log(`用户: ${input}`);

        // ---------- 步骤 1：检索相关历史对话 ----------
        console.log('\n【检索相关历史对话】');
        // 根据当前用户输入，在向量库中检索最相关的 top 2 条历史
        const retrievedConversations = await retrieveRelevantConversations(input, 2);

        let relevantHistory = '';
        if (retrievedConversations.length > 0) {
            // 打印检索结果，包括相似度分数，方便观察
            retrievedConversations.forEach((conv, idx) => {
                console.log(`\n[历史对话 ${idx + 1}] 相似度: ${conv.score.toFixed(4)}`);
                console.log(`轮次: ${conv.round}`);
                console.log(`内容: ${conv.content}`);
            });

            // 构建上下文文本，将检索到的历史格式化
            // 拼接到 Prompt 中给 AI 参考
            relevantHistory = retrievedConversations.map((conv, idx) => {
                return `[历史对话 ${idx + 1}]
                        轮次: ${conv.round}
                        ${conv.content}`;
            }).join('\n\n━━━━━\n\n');
        } else {
            console.log('没有找到相关的历史对话');
        }

        // ---------- 步骤 2：构建 Prompt ----------
        // 如果检索到了相关历史，把历史放进去作为上下文
        // 否则只传用户当前问题
        const contextMessage = relevantHistory
            ? [new HumanMessage(`相关历史对话：\n${relevantHistory}\n\n用户问题: ${input}`)]
            : [userMessage];

        // ---------- 步骤 3：调用模型生成回答 ----------
        console.log('\n【生成回答】');
        const response = await model.invoke(contextMessage);

        // 将当前对话保存到内存历史
        await chatHistory.addMessage(userMessage);
        await chatHistory.addMessage(response);

        // ---------- 步骤 4：将本轮对话保存到 Milvus ----------
        // 把完整的用户提问 + AI 回答保存，供后续检索使用
        const conversationText = `用户: ${input}\n助手: ${response.content}`;
        // 生成唯一 ID
        const convId = `conv_${Date.now()}_${i + 1}`;
        // 生成对话的向量嵌入
        const convVector = await getEmbedding(conversationText);

        try {
            // 将对话插入 Milvus
            await client.insert({
                collection_name: COLLECTION_NAME,
                data: [
                    {
                        id: convId,
                        content: conversationText,  // 原始文本
                        vector: convVector,          // 向量嵌入
                        round: i + 1,               // 轮次编号
                        timestamp: Date.now(),       // 时间戳
                    }
                ]
            });
            console.log(`💾 已保存到 Milvus 向量数据库`);
        } catch (error) {
            console.warn('保存到向量数据库时出错:', error.message);
        }

        // 打印 AI 回答
        console.log(`助手: ${response.content}`);
    }
};

// ========== 执行演示 ==========
try {
    await retrievalMemoryDemo();
} catch (error) {
    console.warn('出错:', error.message);
}
