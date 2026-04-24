/**
 * @fileoverview Milvus 向量数据库 - 更新/插入数据示例
 *
 * 这个示例展示了如何：
 * 1. 更新已有的向量记录
 * 2. 使用 upsert 操作（如果记录不存在则插入，存在则更新）
 * 3. 重新生成文本的向量嵌入
 *
 * 核心概念：
 * - Upsert：Update + Insert 的组合操作
 * - 更新向量：修改文本后必须重新生成向量，否则向量和内容不一致
 * - 主键：通过主键 id 定位要更新的记录
 */

// 加载环境变量
import "dotenv/config"
// OpenAI 嵌入模型，将文本重新转换为向量
import { OpenAIEmbeddings } from "@langchain/openai"
// Milvus 客户端 SDK
import { MilvusClient } from "@zilliz/milvus2-sdk-node"

// ==================== 配置常量 ====================
// Milvus 集合名称（必须和 insert.mjs 中一致）
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
 * 主函数：更新日记记录完整流程
 */
const main = async () => {
    try {
        // 等待 Milvus 连接建立
        console.log("Connecting to Milvus...")
        await client.connectPromise
        console.log("Connected to Milvus")

        // ==================== 更新日记记录 ====================
        console.log("Updating diary entry...")

        // 要更新的记录 ID（主键必须存在才能更新）
        const updateId = "diary_001"

        // 新的内容数据
        const updateContent = {
            id: updateId,  // 主键必须指定，用于定位记录
            content: '今天下了一整天的雨，心情很糟糕。工作上遇到了很多困难，感觉压力很大。一个人在家，感觉特别孤独。',
            date: '2026-04-24',
            mood: 'sad',
            tags: ['生活', '雨']
        }

        // ⚠️ 重要：修改了文本内容，必须重新生成向量！
        // 如果只更新元数据不更新文本，可以不重新生成向量
        console.log('Generating new embedding...')
        const vector = await getEmbedding(updateContent.content)

        // 组装完整数据：元数据 + 新的向量
        const updateData = { ...updateContent, vector };

        // 执行 upsert 操作：
        // - 如果 id 已存在 → 更新这条记录
        // - 如果 id 不存在 → 插入新记录
        await client.upsert({
            collection_name: COLLECTION_NAME,
            data: [updateData],  // 支持批量更新，这里只更新一条
        })

        // 打印更新结果
        console.log(`✓ Updated diary entry: ${updateId}`);
        console.log(`  New content: ${updateContent.content}`);
        console.log(`  New mood: ${updateContent.mood}`);
        console.log(`  New tags: ${updateContent.tags.join(', ')}\n`);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

// 执行更新操作
main()
