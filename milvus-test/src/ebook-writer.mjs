/**
 * @fileoverview EPUB 电子书向量化入库示例 - 完整 RAG 知识库构建
 *
 * 这个程序将 EPUB 电子书解析、拆分、向量化后存入 Milvus 向量数据库：
 * 1. 加载 EPUB 文件，按章节自动拆分
 * 2. 使用递归字符切割器将章节切分成更小的文本块（chunk）
 * 3. 为每个文本块生成向量嵌入
 * 4. 流式插入到 Milvus 中（处理一章插入一章，避免内存溢出）
 *
 * 应用场景：
 * - 构建个人电子书知识库
 * - 支持基于内容的语义搜索
 * - 可以用 RAG 问答你的电子书内容
 *
 * 技术点：
 * - 递归字符切分：尽量保持语义完整性，在段落、句子边界切割
 * - 重叠块（chunk overlap）：保持上下文连贯性，避免信息断裂
 * - 流式处理：大电子书不会一次性占满内存
 */

// 加载环境变量
import "dotenv/config"
// 从路径提取文件名
import { parse } from "path"
// OpenAI 嵌入模型，将文本转为向量
import { OpenAIEmbeddings } from "@langchain/openai"
// Milvus 客户端 SDK 及类型
import { MilvusClient, DataType, MetricType, IndexType } from "@zilliz/milvus2-sdk-node"
// LangChain: EPUB 加载器，自动解析电子书章节
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub'
// LangChain: 递归字符文本拆分器
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"

// ==================== 配置常量 ====================
// Milvus 集合名称（存储电子书的表）
const COLLECTION_NAME = "ebook_collection"
// 向量维度，必须和嵌入模型输出一致
const VECTOR_DIMENSION = 1024
// Milvus 服务地址
const MILVUS_ADDRESS = "localhost:19530"
// 文本块大小：每个 chunk 约 500 个字符 太小会碎片化语义，太大会超出上下文窗口
const CHUNK_SIZE = 500;
// 要处理的 EPUB 文件路径
const EPUB_FILE = './epub/倚天屠龙记.epub';
// 从文件名提取书名（去掉扩展名）
const BOOK_NAME = parse(EPUB_FILE).name;
console.log(`将要处理: ${BOOK_NAME}`);

// ==================== 初始化模型和客户端 ====================
// 初始化 OpenAI 嵌入模型
const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.EMBEDDINGS_MODEL_NAME,
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL
    },
    dimensions: VECTOR_DIMENSION
})

// 初始化 Milvus 客户端
const client = new MilvusClient({ address: MILVUS_ADDRESS })

/**
 * 将文本转换为向量嵌入
 * @param {string} text - 输入文本块
 * @returns {Promise<number[]>} 向量数组
 */
const getEmbedding = async (text) => {
    const embedding = await embeddings.embedQuery(text)
    return embedding
}

/**
 * 检查集合是否存在，如果不存在则创建集合和索引
 * 确保集合已加载到内存可以搜索
 * @returns {Promise<void>}
 */
const ensureCollection = async () => {
    try {
        console.log('\n 检查集合是否存在...');
        // 检查集合是否存在
        const hasCollection = await client.hasCollection({
            collection_name: COLLECTION_NAME
        });

        if (!hasCollection.value) {
            console.log(' 集合不存在，开始创建...');
            // 创建集合，定义字段结构
            await client.createCollection({
                collection_name: COLLECTION_NAME,
                fields: [
                    // 主键：bookId_chapter_chunkIndex 组合ID
                    { name: 'id', data_type: DataType.VarChar, max_length: 100, is_primary_key: true },
                    // 书籍ID：区分不同的电子书
                    { name: 'book_id', data_type: DataType.VarChar, max_length: 100 },
                    // 书籍名称：方便筛选
                    { name: 'book_name', data_type: DataType.VarChar, max_length: 200 },
                    // 章节号
                    { name: 'chapter_num', data_type: DataType.Int32 },
                    // 章节内的块索引
                    { name: 'index', data_type: DataType.Int32 },
                    // 原始文本内容
                    { name: 'content', data_type: DataType.VarChar, max_length: 10000 },
                    // 文本的向量嵌入
                    { name: 'vector', data_type: DataType.FloatVector, dim: VECTOR_DIMENSION }
                ]
            });
            console.log('集合创建成功');

            // 为向量字段创建索引，加速搜索
            console.log('\n 创建向量索引...');
            await client.createIndex({
                collection_name: COLLECTION_NAME,
                field_name: 'vector',
                index_type: IndexType.IVF_FLAT,
                metric_type: MetricType.COSINE,  // 余弦相似度
                params: { nlist: 1024 }  // 聚类中心数量
            });
            console.log('索引创建成功');
        } else {
            console.log('集合已存在，跳过创建');
        }

        // 确保集合已加载到内存，只有加载后才能搜索
        console.log('\n加载集合到内存...');
        try {
            await client.loadCollection({ collection_name: COLLECTION_NAME });
            console.log('集合已加载完成');
        } catch (error) {
            // 如果已经加载过会报错，这是正常现象
            console.log('集合已处于加载状态');
        }

    } catch (error) {
        console.error('创建集合时出错:', error.message);
        throw error;
    }
}

/**
 * 将一个章节切分后的多个文本块批量生成向量并插入 Milvus
 * @param {string[]} chunks - 切分好的文本块数组
 * @param {string} bookId - 书籍ID
 * @param {number} chapterNum - 章节号
 * @returns {Promise<number>} 成功插入的数量
 */
const insertChunksBatch = async (chunks, bookId, chapterNum)=> {
    try {
        if (chunks.length === 0) {
            console.log('没有文本块，跳过');
            return 0;
        }

        console.log(`正在为 ${chunks.length} 个片段生成向量...`);

        // 并行为每个文本块生成向量，组装成 Milvus 需要的格式
        const insertData = await Promise.all(
            chunks.map(async (chunk, chunkIndex) => {
                const vector = await getEmbedding(chunk);
                // 组合生成唯一 ID：book_id_chapterNum_chunkIndex
                return {
                    id: `${bookId}_${chapterNum}_${chunkIndex}`,
                    book_id: bookId,
                    book_name: BOOK_NAME,
                    chapter_num: chapterNum,
                    index: chunkIndex,
                    content: chunk,
                    vector: vector
                };
            })
        );

        console.log(`正在插入到 Milvus...`);

        // 批量插入到 Milvus
        const insertResult = await client.insert({
            collection_name: COLLECTION_NAME,
            data: insertData
        });

        const insertedCount = Number(insertResult.insert_cnt) || 0;
        console.log(`完成，插入 ${insertedCount} 条`);

        return insertedCount;
    } catch (error) {
        console.error(`插入章节 ${chapterNum} 的数据时出错:`, error.message);
        throw error;
    }
}

/**
 * 加载 EPUB 文件并进行流式处理（边处理边插入）
 * 这样处理大电子书不会占用太多内存
 * @param {string} bookId - 书籍ID
 * @returns {Promise<number>} 总共插入的记录数
 */
const loadAndProcessEPubStreaming = async(bookId)=> {
    try {
        console.log(`\n开始加载 EPUB 文件: ${EPUB_FILE}`);

        // 使用 LangChain 的 EPubLoader 加载文件
        // splitChapters: true 会自动按章节拆分
        const loader = new EPubLoader(
            EPUB_FILE,
            {
                splitChapters: true,  // 按章节拆分
            }
        );

        // 加载所有章节
        const documents = await loader.load();
        console.log(`EPUB 加载完成，共识别出 ${documents.length} 个章节\n`);

        if (documents.length === 0) {
            console.log('没有找到任何章节，请检查 EPUB 文件');
            return 0;
        }

        // 创建递归字符文本拆分器
        // 递归拆分：先尝试在段落边界切，不行再句子，不行再单词
        // 这样能最大程度保持语义完整性
        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: CHUNK_SIZE,          // 目标块大小（字符数）
            chunkOverlap: Math.floor(CHUNK_SIZE * 0.1),  // 重叠：10%，保持上下文连贯
            // chunkOverlap: 50, 这里用比例更灵活
        });

        console.log(`文本拆分配置: chunkSize=${CHUNK_SIZE}, overlap=${Math.floor(CHUNK_SIZE * 0.1)}`);
        console.log('\n开始处理章节...');

        let totalInserted = 0;
        const startTime = Date.now();

        // 遍历每个章节，处理完一章就插入一章（流式处理）
        for (let chapterIndex = 0, length = documents.length; chapterIndex < length; chapterIndex++) {
            const chapter = documents[chapterIndex];
            const chapterContent = chapter.pageContent;
            const chapterTitle = chapter.metadata?.title || `第 ${chapterIndex + 1} 章`;

            console.log(`\n处理第 ${chapterIndex + 1}/${length} 章: ${chapterTitle}`);
            console.log(`原文字数: ${chapterContent.length} 字符`);

            // 使用拆分器进行二次拆分，切成更小的文本块
            const chunks = await textSplitter.splitText(chapterContent);

            console.log(`拆分完成，得到 ${chunks.length} 个文本块`);

            if (chunks.length === 0) {
                console.log('章节内容为空，跳过\n');
                continue;
            }

            // 生成向量并插入该章节的所有片段
            const insertedCount = await insertChunksBatch(chunks, bookId, chapterIndex + 1);
            totalInserted += insertedCount;

            // 累计进度
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`\n进度: 已插入 ${totalInserted} 条记录，耗时 ${elapsed}s`);
        }

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n 全部处理完成！`);
        console.log(`   - 书籍: ${BOOK_NAME}`);
        console.log(`   - 总章节数: ${documents.length}`);
        console.log(`   - 总文本块: ${totalInserted}`);
        console.log(`   - 耗时: ${totalTime}s\n`);

        return totalInserted;
    } catch (error) {
        console.error('加载 EPUB 文件时出错:', error.message);
        throw error;
    }
}

/**
 * 主函数：电子书向量化完整流程
 */
const main = async ()=> {
    try {
        console.log('='.repeat(80));
        console.log('EPUB 电子书向量化程序');
        console.log('='.repeat(80));

        // 连接 Milvus
        console.log('\n正在连接 Milvus...');
        await client.connectPromise;
        console.log('Milvus 连接成功\n');

        // 书籍ID，这里简单处理用固定值，如果要入库多本可以改为参数
        const bookId = 3;

        // 确保集合存在且已加载
        await ensureCollection();

        // 加载 EPUB 并流式处理入库
        await loadAndProcessEPubStreaming(bookId);

        console.log('='.repeat(80));
        console.log('处理完成！电子书已成功存入 Milvus 向量数据库');
        console.log(`集合: ${COLLECTION_NAME}`);
        console.log('='.repeat(80));

    } catch (error) {
        console.error('\n处理失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// 开始执行
main();
