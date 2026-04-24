/**
 * @fileoverview Milvus 向量数据库 - 删除数据示例
 *
 * 这个示例展示了 Milvus 中三种常用的删除方式：
 * 1. 根据主键删除单条记录
 * 2. 批量删除多条指定记录
 * 3. 根据条件筛选删除（满足条件的所有记录都会被删除）
 *
 * 核心概念：
 * - 筛选表达式（filter）：Milvus 使用布尔表达式筛选要删除的记录
 * - 支持比较运算符：`==`, `!=`, `>`, `<`, `>=`, `<=`
 * - 支持成员运算符：`in`
 * - 支持逻辑运算符：`&&` (AND), `||` (OR)
 */

// 加载环境变量
import "dotenv/config"
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
// 初始化 OpenAI 嵌入模型（删除操作不一定需要，但为了保持结构一致保留）
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
 * 主函数：演示不同的删除方式
 */
const main = async () => {
    try {
        // 等待 Milvus 连接建立
        console.log("Connecting to Milvus...")
        await client.connectPromise
        console.log("Connected to Milvus")
        console.log("Deleting diary entry...\n")

        // -------------------- 1. 删除单条记录 --------------------
        // 根据主键 id 精确匹配，删除一条特定记录
        const deleteId = "diary_005"
        const result = await client.delete({
            collection_name: COLLECTION_NAME,
            // filter 是筛选表达式，语法类似 SQL
            filter: `id == "${deleteId}"`,  // id 等于指定值
        })
        console.log(`✓ Deleted ${result.delete_cnt} record(s)`);
        console.log(`  ID: ${deleteId}\n`);

        // -------------------- 2. 批量删除多条记录 --------------------
        // 使用 in 运算符删除多个 id
        const deleteIds = ["diary_002", "diary_003"]
        const idStr = deleteIds.map(id => `"${id}"`).join(", ")
        const batchResult = await client.delete({
            collection_name: COLLECTION_NAME,
            filter: `id in [${idStr}]`,  // id 在这个列表中
        })
        console.log(`✓ Batch deleted ${batchResult.delete_cnt} record(s)`);
        console.log(`  IDs: ${deleteIds.join(', ')}\n`);

        // -------------------- 3. 按条件删除 --------------------
        // 删除满足任意条件的所有记录，比如删除所有心情为 sad 的日记
        console.log("Deleting diary entries by condition...")
        const conditionResult = await client.delete({
            collection_name: COLLECTION_NAME,
            filter: `mood == "sad"`,  // 所有 mood 等于 "sad" 的记录
        })
        console.log(`✓ Deleted ${conditionResult.delete_cnt} record(s) with mood="sad"\n`)

    } catch (error) {
        console.error('Error:', error.message);
    }
}

// 执行删除操作
main()
