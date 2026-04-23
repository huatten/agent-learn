/**
 * @fileoverview RAG (Retrieval-Augmented Generation) 完整示例
 *
 * 这个示例展示了完整的 RAG 问答流程，结合 Milvus 向量数据库和 LLM：
 * 1. 用户提问 → 将问题转为向量
 * 2. 向量检索 → 从 Milvus 中找到语义相关的日记
 * 3. 上下文拼接 → 将检索结果拼接到 Prompt 中
 * 4. LLM 回答 → ChatGPT 基于上下文回答问题
 *
 * RAG 的优势：
 * - 让 LLM 基于你的私有数据（日记）回答问题
 * - 比纯生成更准确，减少幻觉（hallucination）
 * - 可以动态更新知识库，无需重新训练模型
 */

// 加载环境变量
import "dotenv/config"
// LangChain: OpenAI 聊天模型 用于生成回答，嵌入模型 用于向量转换
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai"
// Milvus 客户端 SDK
import { MilvusClient, MetricType } from "@zilliz/milvus2-sdk-node"

// ==================== 配置常量 ====================
// Milvus 集合名称（与 insert.mjs 一致）
const COLLECTION_NAME = "ai_diary"
// 向量维度，必须和集合定义一致
const VECTOR_DIMENSION = 1024
// Milvus 服务地址
const MILVUS_ADDRESS = "localhost:19530"

// ==================== 初始化模型和客户端 ====================
// 初始化 OpenAI 聊天模型，用于最终回答生成
const model = new ChatOpenAI({
    model: process.env.MODEL_NAME,
    temperature: 0.7,  // 温度值：0 更确定保守，1 更创造性多样
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL  // 支持自定义代理地址
    }
})

// 初始化 OpenAI 嵌入模型，用于将文本转换为向量
const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.EMBEDDINGS_MODEL_NAME,
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL
    },
    dimensions: VECTOR_DIMENSION
})

// 创建 Milvus 客户端实例
const client = new MilvusClient({ address: MILVUS_ADDRESS })

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
 * 从 Milvus 中检索与问题相关的日记条目
 * @param {string} question - 用户问题
 * @param {number} k - 返回多少条最相关的结果，默认 2 条
 * @returns {Promise<Array>} 检索结果数组，按相似度降序排列
 */
const retrieveRelevantDiaries = async (question, k = 2) => {
    try {
        // Step 1: 将用户问题生成向量嵌入
        const queryVector = await getEmbedding(question)
        // Step 2: 在 Milvus 中执行相似性搜索
        const searchResult = await client.search({
            collection_name: COLLECTION_NAME,
            vector: queryVector,       // 用问题向量进行搜索
            limit: k,                  // 只返回 Top-K 最相似结果
            output_fields: ['id', 'content', 'date', 'mood', 'tags'],  // 返回哪些元数据
            metric_type: MetricType.COSINE,  // 使用余弦相似度度量
        })
        // 返回搜索结果，Milvus 已经自动按相似度从高到低排序
        return searchResult.results
    } catch (error) {
        console.log('检索日记时出错:', error.message);
        return [];
    }
}

/**
 * RAG 完整流程：检索 + 生成，回答用户问题
 * @param {string} question - 用户问题
 * @param {number} k - 检索多少条相关日记作为上下文
 * @returns {Promise<string>} LLM 生成的最终回答
 */
const answerDiaryQuestion = async (question, k = 2) => {
    try {
        console.log('-'.repeat(80))
        console.log(`正在检索与问题 「${question}」 相关的日记...`)
        console.log('-'.repeat(80))

        // Step 1: 向量检索 - 找到和问题语义相关的日记
        console.log('\n 1️⃣ 正在检索相关的日记...')
        const relevantDiaries = await retrieveRelevantDiaries(question, k)
        if (relevantDiaries.length === 0){
            return '没有找到与问题相关的日记。请重新尝试。'
        }

        // Step 2: 打印检索结果（方便调试和观察）
        console.log('\n 2️⃣ 检索到的日记：')
        relevantDiaries.forEach((item, index) => {
            console.log(`\n[日记 ${index + 1}] 相似度: ${item.score.toFixed(4)}`);
            console.log(` 内容: ${item.content}`)
            console.log(` 日期: ${item.date}`)
            console.log(` 心情: ${item.mood}`)
            console.log(` 标签: ${item.tags}`)
            console.log(` 相似度分数: ${item.score}`)
        })

        // Step 3: 构建上下文文本
        // 把检索到的多篇日记拼接成一段文本，提供给 LLM 作为参考
        console.log('\n 3️⃣ 构建上下文...')
        const context = relevantDiaries
            .map((diary, i) => {
                return `[日记 ${i + 1}]
                        日期: ${diary.date}
                        心情: ${diary.mood}
                        标签: ${diary.tags?.join(', ')}
                        内容: ${diary.content}`;
            })
            .join('\n\n━━━━━\n\n');

        // Step 4: 构建完整的 Prompt
        // 告诉 LLM：角色是谁 + 上下文是什么 + 问题是什么 + 回答规则
        const prompt = `你是一个温暖贴心的 AI 日记助手。基于用户的日记内容回答问题，用亲切自然的语言。

请根据以下日记内容回答问题：
${context}

用户问题: ${question}

回答要求：
1. 如果日记中有相关信息，请结合日记内容给出详细、温暖的回答
2. 可以总结多篇日记的内容，找出共同点或趋势
3. 如果日记中没有相关信息，请温和地告知用户
4. 用第一人称"你"来称呼日记的作者
5. 回答要有同理心，让用户感到被理解和关心

AI 助手的回答:`;

        // Step 5: 调用 LLM 生成最终回答
        console.log('\n 4️⃣ 使用 ChatOpenAI 模型生成回答...')
        const response = await model.invoke(prompt)
        console.log(`\n 🤖 AI 回答: ${response.content}`)
        return response.content
    } catch (error) {
        console.error('回答问题时出错:', error.message);
        return '抱歉，处理您的问题时出现了错误。';
    }
}

/**
 * 主函数：演示 RAG 问答流程
 */
const main = async () => {
    try {
        console.log('连接到 Milvus...');
        await client.connectPromise
        console.log('已连接到 Milvus。\n');

        // 演示：提问"我最近做了什么让我感到快乐的事情？"
        await answerDiaryQuestion('我最近做了什么让我感到快乐的事情？')
    } catch (error) {
        console.log('错误:', error.message)
    }
}

// 执行 RAG 演示
main()
