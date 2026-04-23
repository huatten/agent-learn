/**
 * @fileoverview Milvus 向量数据库 - 数据插入示例
 *
 * 这个示例展示了如何：
 * 1. 连接 Milvus 向量数据库
 * 2. 创建集合（表）并定义字段结构
 * 3. 为向量字段创建索引
 * 4. 将文本通过 OpenAI 转换为向量嵌入
 * 5. 插入向量数据到 Milvus
 *
 * 核心概念：
 * - Collection（集合）：Milvus 中存储向量和元数据的表
 * - Vector（向量）：文本通过嵌入模型转换得到的数值数组，代表语义
 * - Index（索引）：为了加速向量搜索建立的索引结构
 * - Embedding（嵌入）：将文本转换为向量的过程
 */

// 加载环境变量
import "dotenv/config"
// 使用 LangChain 的 OpenAI 嵌入模型将文本转换为向量
import { OpenAIEmbeddings } from "@langchain/openai"
// Milvus 客户端 SDK，导入需要的类型和常量
import { MilvusClient, DataType, MetricType, IndexType } from "@zilliz/milvus2-sdk-node"

// ==================== 配置常量 ====================
// 集合名称（相当于数据库中的表名）
const COLLECTION_NAME = "ai_diary"
// 向量维度，需要和使用的嵌入模型输出维度一致
// 这里使用 text-embedding-3-large 模型输出是 1024 维
const VECTOR_DIMENSION = 1024
// Milvus 服务地址，默认端口是 19530
const MILVUS_ADDRESS = "localhost:19530"

// ==================== 初始化客户端 ====================
// 初始化 OpenAI 嵌入模型，将文本转换为向量
const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.EMBEDDINGS_MODEL_NAME,
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL  // 支持代理/自定义 API 地址
    },
    dimensions: VECTOR_DIMENSION  // 指定输出向量维度
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
    // embedQuery 用于将查询文本转换为向量
    // 如果是批量文档转换，使用 embedDocuments
    const embedding = await embeddings.embedQuery(text)
    return embedding
}

/**
 * 主函数：完成集合创建、索引构建、数据插入全流程
 */
const main = async () => {
    try {
        // 等待 Milvus 连接建立
        console.log("Connecting to Milvus...")
        await client.connectPromise
        console.log("Connected to Milvus")

        // -------------------- 创建集合 --------------------
        // 在 Milvus 中创建一个新集合，定义各个字段的结构
        console.log("Creating collection...")
        await client.createCollection({
            collection_name: COLLECTION_NAME,
            fields: [
                // 主键字段：每条记录唯一标识
                { name: 'id', data_type: DataType.VarChar, max_length: 50, is_primary_key: true },
                // 向量字段：存储文本的语义向量，维度必须和嵌入模型输出一致
                { name: 'vector', data_type: DataType.FloatVector, dim: VECTOR_DIMENSION },
                // 日记内容字段：存储原始文本，最大 5000 字符
                { name: 'content', data_type: DataType.VarChar, max_length: 5000 },
                // 日期字段：存储日记日期
                { name: 'date', data_type: DataType.VarChar, max_length: 50 },
                // 心情字段：存储情绪标签
                { name: 'mood', data_type: DataType.VarChar, max_length: 50 },
                // 标签字段：数组类型，存储多个标签，每个标签是字符串
                { name: 'tags', data_type: DataType.Array, element_type: DataType.VarChar, max_capacity: 10, max_length: 50 }
            ]
        })
        console.log("Collection created")

        // -------------------- 创建索引 --------------------
        // 为向量字段创建索引，加速相似性搜索
        // 如果不创建索引，Milvus 会进行暴力搜索，速度很慢
        console.log( "\n Creating index...")
        await client.createIndex({
            collection_name: COLLECTION_NAME,
            field_name: 'vector',        // 为哪个字段创建索引
            index_name: 'vector_index',  // 索引名称
            metric_type: MetricType.COSINE,  // 距离度量方式：余弦相似度
                                 // 余弦相似度适合衡量语义相似性，取值范围 [-1,1]，越接近 1 越相似
            index_type: IndexType.IVF_FLAT,  // 索引类型：倒排文件索引
                                 // IVF_FLAT 是最常用的索引类型，平衡精度和性能
            params: { nlist: 1024 }    // IVF 聚类中心数量，经验法则：nlist = 4 * sqrt(n)，n是数据量
        })
        console.log("Index created")

        // -------------------- 加载集合 --------------------
        // 将集合加载到内存中，只有加载后的集合才能进行搜索
        console.log("\n Loading collection...")
        await client.loadCollection({ collection_name: COLLECTION_NAME })
        console.log("Collection loaded")

        // -------------------- 准备数据 --------------------
        // 示例日记数据，包含内容、日期、心情、标签等元数据
        console.log("\n Inserting diary entries...")
        const diaryEntries = [
            {
                id: 'diary_001',
                content: '今天天气很好，去公园散步了，心情愉快。看到了很多花开了，春天真美好。',
                date: '2026-01-10',
                mood: 'happy',
                tags: ['生活', '散步']
            },
            {
                id: 'diary_002',
                content: '今天工作很忙，完成了一个重要的项目里程碑。团队合作很愉快，感觉很有成就感。',
                date: '2026-01-11',
                mood: 'excited',
                tags: ['工作', '成就']
            },
            {
                id: 'diary_003',
                content: '周末和朋友去爬山，天气很好，心情也很放松。享受大自然的感觉真好。',
                date: '2026-01-12',
                mood: 'relaxed',
                tags: ['户外', '朋友']
            },
            {
                id: 'diary_004',
                content: '今天学习了 Milvus 向量数据库，感觉很有意思。向量搜索技术真的很强大。',
                date: '2026-01-12',
                mood: 'curious',
                tags: ['学习', '技术']
            },
            {
                id: 'diary_005',
                content: '晚上做了一顿丰盛的晚餐，尝试了新菜谱。家人都说很好吃，很有成就感。',
                date: '2026-01-13',
                mood: 'proud',
                tags: ['美食', '家庭']
            }
        ]
        console.log('Generating embeddings...')

        // 并行为每条日记内容生成向量嵌入
        // 使用 Promise.all 并发处理，提高速度
        const diaryData = await Promise.all(
            diaryEntries.map(async (entry) => {
                return {
                    ...entry,  // 保留原有的元数据
                    vector: await getEmbedding(entry.content)  // 添加向量字段
                }
            })
        )

        // -------------------- 插入数据 --------------------
        // 将生成好的数据插入到 Milvus 中
        const insertResult = await client.insert({
            collection_name: COLLECTION_NAME,
            data: diaryData
        })
        console.log(`✓ Inserted ${insertResult.insert_cnt} records\n`)
    } catch (error) {
        console.log('Error:', error.message);
    }
}

// 执行主函数
main()
