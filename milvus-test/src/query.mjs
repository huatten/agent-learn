/**
 * @fileoverview Milvus 向量数据库 - 相似性搜索示例
 *
 * 这个示例展示了如何：
 * 1. 连接已有的 Milvus 集合
 * 2. 将用户查询文本转换为向量
 * 3. 在 Milvus 中进行向量相似性搜索
 * 4. 返回语义最相似的 Top-K 结果
 *
 * 核心概念：
 * - 向量搜索：根据向量的余弦距离找到语义相似的内容
 * - Top-K：只返回相似度最高的前 K 个结果
 * - 余弦相似度：衡量两个向量方向的相似程度，与长度无关
 */

// 加载环境变量
import "dotenv/config"
// OpenAI 嵌入模型，将查询文本转换为向量
import { OpenAIEmbeddings } from "@langchain/openai"
// Milvus 客户端 SDK
import { MilvusClient, MetricType } from "@zilliz/milvus2-sdk-node"

// ==================== 配置常量 ====================
// 要搜索的集合名称（必须和 insert.mjs 中一致）
const COLLECTION_NAME = "ai_diary"
// 向量维度，必须和集合定义一致
const VECTOR_DIMENSION = 1024
// Milvus 服务地址
const MILVUS_ADDRESS = "localhost:19530"

// ==================== 初始化客户端 ====================
// 初始化 OpenAI 嵌入模型
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
 * 主函数：向量相似性搜索完整流程
 */
const main = async () => {
    try {
        // 等待 Milvus 连接建立
        console.log("Connecting to Milvus...")
        await client.connectPromise
        console.log("Connected to Milvus")

        // ==================== 向量相似性搜索 ====================
        // 用户查询：我们要找到和这个查询语义相似的日记
        // 注意：这是语义搜索，不是关键词匹配！
        // 即使日记中没有"做饭"，但有"晚餐"、"菜谱"也会被找到
        console.log("Searching for similar diary entries...")
        const query = "我想找关于做饭和学习的日记"
        console.log(`Query: "${query}"\n`)

        // 将查询文本转换为向量
        const queryVector = await getEmbedding(query)

        // 在 Milvus 中执行相似性搜索
        const searchResult = await client.search({
            collection_name: COLLECTION_NAME,  // 搜索哪个集合
            vector: queryVector,               // 查询向量
            limit: 2,                          // 返回 Top 2 最相似的结果
            // 指定返回哪些元数据字段（id、content 等）
            // 如果不指定，默认只返回 id 和相似度分数
            output_fields: ['id', 'content', 'date', 'mood', 'tags'],
            // 距离度量方式，必须和建索引时一致
            // COSINE = 余弦相似度，适合语义搜索
            metric_type: MetricType.COSINE,
        })

        // 打印搜索结果
        console.log(`Found ${searchResult.results.length} results:\n`);

        // 遍历结果，Milvus 返回结果已经按相似度从高到低排序
        for (const result of searchResult.results) {
            console.log(`ID: ${result.id}`);
            console.log(`Content: ${result.content}`);
            console.log(`Date: ${result.date}`);
            console.log(`Mood: ${result.mood}`);
            console.log(`Tags: ${result.tags}`);
            console.log('----------------------------------');
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

// 执行搜索
main()
