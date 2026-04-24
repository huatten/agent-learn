/**
 * @fileoverview 电子书语义搜索示例 - 基于 Milvus 向量数据库
 *
 * 这个示例展示了如何对已入库的电子书进行语义搜索：
 * 1. 将用户查询问题转为向量
 * 2. 在 Milvus 中查找语义最相似的文本片段
 * 3. 返回 Top-K 最相关的内容片段
 *
 * 这是 RAG 问答的关键步骤：先检索相关内容，再交给 LLM 回答
 *
 * 语义搜索 vs 关键词搜索：
 * - ❌ 关键词搜索：必须匹配 exact 词语，找不到同义词/相关概念
 * - ✅ 语义搜索：理解问题含义，找到语义相关内容，即使没有相同关键词
 */

// 加载环境变量
import "dotenv/config"
// OpenAI 嵌入模型，将查询文本转换为向量
import { OpenAIEmbeddings } from "@langchain/openai"
// Milvus 客户端 SDK
import { MilvusClient, MetricType } from "@zilliz/milvus2-sdk-node"

// ==================== 配置常量 ====================
// Milvus 集合名称（与 ebook-writer.mjs 必须一致）
const COLLECTION_NAME = "ebook_collection"
// 向量维度，必须和入库时一致
const VECTOR_DIMENSION = 1024
// Milvus 服务地址
const MILVUS_ADDRESS = "localhost:19530"
// 返回多少条最相关的结果
const TOP_K = 3

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
 * 主函数：电子书语义搜索完整流程
 */
const main = async () => {
    try {
        // 连接 Milvus
        console.log('='.repeat(80));
        console.log('🔍 电子书语义搜索');
        console.log('='.repeat(80));
        console.log('\n🔌 连接 Milvus...');
        await client.connectPromise
        console.log('✅ 已连接\n');

        // 用户查询：你要搜索什么内容？
        // 这是语义搜索，可以理解问题的含义
        const query = "女孩因灵性而美，我们要不要给她太多的限制呢？";
        console.log(`❓ 查询: "${query}"\n`);

        // Step 1: 将查询文本转换为向量
        console.log('🧭 生成查询向量...');
        const queryVector = await getEmbedding(query);
        console.log('✅ 向量生成完成\n');

        // Step 2: 在 Milvus 中执行相似性搜索
        console.log('🔍 在电子书库中搜索相似内容...');
        const searchResult = await client.search({
            collection_name: COLLECTION_NAME,
            vector: queryVector,               // 用查询向量搜索
            limit: TOP_K,                      // 返回 TOP-K 最相似结果
            // 指定返回哪些元数据字段
            output_fields: ['id', 'book_id', 'chapter_num', 'index', 'content'],
            // 距离度量方式，必须和建索引时一致
            // COSINE = 余弦相似度，适合语义搜索
            metric_type: MetricType.COSINE,
        });

        // 打印搜索结果
        console.log(`\n🎉 找到 ${searchResult.results.length} 条相关结果（按相似度降序）:\n`);

        // Milvus 返回结果已经自动按相似度从高到低排序
        // 分数越接近 1，相似度越高
        searchResult.results.forEach((result, idx) => {
            console.log(`📌 结果 ${idx + 1} [相似度: ${result.score.toFixed(4)}]`);
            console.log(`   ID: ${result.id}`);
            console.log(`   Book ID: ${result.book_id}`);
            console.log(`   Chapter: 第${result.chapter_num}章`);
            console.log(`   片段索引: ${result.index}`);
            console.log(`\n   内容:\n${result.content.trim()}`);
            console.log('\n' + '─'.repeat(70));
        });

    } catch (error) {
        console.error('\n❌ 搜索出错:', error.message);
    }
}

// 开始搜索
main()
