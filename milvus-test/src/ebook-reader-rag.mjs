/**
 * @fileoverview 电子书 RAG 问答完整示例 - 基于 Milvus 向量数据库
 *
 * 这个程序展示了完整的 RAG 问答流程，针对已入库的电子书：
 * 1. 用户提出关于电子书内容的问题
 * 2. 语义检索 → 在 Milvus 中找到与问题相关的内容片段
 * 3. 上下文拼接 → 将检索到的片段拼接到 Prompt
 * 4. LLM 回答 → ChatGPT 基于电子书内容回答问题
 *
 * 这是完整的 "私域知识库问答" 方案：
 * - 📚 把你的电子书（小说、文献、笔记）存入向量数据库
 * - ❓ 提问 → 🔍 找到相关内容 → 🤖 LLM 基于内容回答
 * - ✅ 不会胡说八道，只基于书里的真实内容回答
 */

// 加载环境变量
import "dotenv/config"
// LangChain: ChatOpenAI 用于生成回答，OpenAIEmbeddings 用于向量转换
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai"
// Milvus 客户端 SDK
import { MilvusClient, MetricType } from "@zilliz/milvus2-sdk-node"

// ==================== 配置常量 ====================
// Milvus 集合名称（必须与 ebook-writer.mjs 一致）
const COLLECTION_NAME = "ebook_collection"
// 向量维度，必须和入库时一致
const VECTOR_DIMENSION = 1024
// Milvus 服务地址
const MILVUS_ADDRESS = "localhost:19530"

// ==================== 初始化模型和客户端 ====================
// 初始化 OpenAI 聊天模型，用于生成最终回答
const model = new ChatOpenAI({
    model: process.env.MODEL_NAME,
    temperature: 0.7,  // 温度值：0 更确定保守，1 更创造性多样
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL  // 支持自定义代理地址
    }
})

// 初始化 OpenAI 嵌入模型，用于将问题转为向量
const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.EMBEDDINGS_MODEL_NAME,
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL
    },
    dimensions: VECTOR_DIMENSION
})

// 创建 Milvus 客户端实例
const client = new MilvusClient({
    address: MILVUS_ADDRESS
})

/**
 * 将文本转换为向量嵌入
 * @param {string} text - 输入文本
 * @returns {Promise<number[]>} 向量数组
 */
const getEmbedding = async (text) => {
    const embedding = await embeddings.embedQuery(text)
    return embedding
}

/**
 * 从 Milvus 向量库中检索与问题语义相关的电子书内容片段
 * @param {string} question - 用户问题
 * @param {number} k - 返回多少条最相关的结果，默认 3
 * @returns {Promise<Array>} 检索结果数组，按相似度降序排列
 */
const retrieveRelevantContent = async (question, k = 3) => {
    try {
        // 将问题转换为向量
        const queryVector = await getEmbedding(question)
        // 在 Milvus 中执行相似性搜索
        const searchResult = await client.search({
            collection_name: COLLECTION_NAME,
            vector: queryVector,                     // 用问题向量进行搜索
            limit: k,                                // 只返回 Top-K 最相似结果
            output_fields: ['id', 'book_id', 'chapter_num', 'index', 'content'],  // 指定返回哪些元数据
            metric_type: MetricType.COSINE,          // 使用余弦相似度度量
        })
        // 返回搜索结果，Milvus 已经按相似度从高到低排序
        return searchResult.results
    } catch (error) {
        console.error('检索内容时出错:', error.message);
        return [];
    }
}

/**
 * RAG 完整流程：检索 + 生成，回答关于电子书的问题
 * @param {string} question - 用户问题
 * @param {number} k - 检索多少条相关片段作为上下文
 * @returns {Promise<string>} LLM 生成的回答
 */
const answerEbookQuestion = async (question, k = 3) => {
    try {
        console.log('='.repeat(80));
        console.log(`问题: ${question}`);
        console.log('='.repeat(80));

        // Step 1: 语义检索 - 从向量库找到相关内容片段
        console.log('\n【检索相关内容】');
        const retrievedContent = await retrieveRelevantContent(question, k);
        if (retrievedContent.length === 0) {
            console.log('没有找到相关的内容。');
            return '没有找到相关的内容。';
        }

        // Step 2: 打印检索结果（方便调试观察）
        retrievedContent.forEach((result, index) => {
            console.log(`\n[片段 ${index + 1}] 相似度: ${result.score.toFixed(4)}`);
            console.log(`书籍: ${result.book_id}`);
            console.log(`章节: 第 ${result.chapter_num} 章`);
            console.log(`片段索引: ${result.index}`);
            console.log(`内容: ${result.content}`);
        });

        // Step 3: 构建上下文文本
        // 将检索到的多个片段拼接成一段文本，提供给 LLM 作为参考
        const context = retrievedContent
            .map((item, i) => {
                return `[片段 ${i + 1}]
章节: 第 ${item.chapter_num} 章
内容: ${item.content}`;
            }).join('\n\n━━━━━\n\n');

        // Step 4: 构建完整的 Prompt
        // 告诉 LLM：角色是什么 + 上下文是什么 + 问题是什么 + 回答规则
        // 这个例子是针对《倚天屠龙记》的，如果换书需要修改系统提示词
        const prompt = `你是一个专业的《倚天屠龙记》小说助手。基于小说内容回答问题，用准确、详细的语言。

请根据以下《倚天屠龙记》小说片段内容回答问题：
${context}

用户问题: ${question}

回答要求：
1. 如果片段中有相关信息，请结合小说内容给出详细、准确的回答
2. 可以综合多个片段的内容，提供完整的答案
3. 如果片段中没有相关信息，请如实告知用户
4. 回答要准确，符合小说的情节和人物设定
5. 可以引用原文内容来支持你的回答

AI 助手的回答:`;

        // Step 5: 调用 LLM 生成回答
        console.log('\n【调用 LLM 生成回答】');
        const response = await model.invoke(prompt);
        console.log(response.content);
        console.log('\n');
        return response.content;
    } catch (error) {
        console.error('回答问题时出错:', error.message);
        return '抱歉，处理您的问题时出现了错误。';
    }
};

/**
 * 主函数：RAG 问答演示
 */
const main = async () => {
    try {
        console.log('连接到 Milvus ...  ');
        await client.connectPromise;
        console.log('已连接到 Milvus');

        // 确保集合已加载到内存
        // 如果已经加载过会报错，我们捕获错误并忽略
        try {
            await client.loadCollection({
                collection_name: COLLECTION_NAME
            });
        } catch (error) {
            // 只有"already loaded"错误可以忽略，其他错误需要抛出
            if (!error.message.includes('already loaded')) {
                throw error;
            }
            console.log('✓ 集合已处于加载状态\n');
        }

        // 演示：提问"张无忌都会哪些武功？"
        await answerEbookQuestion('张无忌都会哪些武功？');
    } catch (error) {
        console.error('错误:', error.message);
    }
};

// 执行 RAG 问答
main();
