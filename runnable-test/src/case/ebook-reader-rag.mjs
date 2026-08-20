/**
 * 电子书 RAG 问答完整示例 - 基于 Milvus 向量数据库 - 使用 Runnable 组合链实现
 *
 * 这个文件演示的是「RAG（检索增强生成）完整流水线」。
 *
 * 核心流程（一条链搞定）：
 * 1. milvusSearch：把用户问题转成向量，去 Milvus 检索最相关的文本片段
 * 2. buildPromptInput：把检索到的片段拼成 context，并打印检索详情
 * 3. 判断逻辑：没有检索结果时直接返回兜底文案，不调用大模型
 * 4. promptTemplate：把 {context} + {question} 组装成完整提示词
 * 5. model：调用大模型生成回答
 * 6. StringOutputParser：把 AIMessage 解析成纯文本字符串
 *
 * 与直接让模型回答不同，RAG 先"从知识库中检索证据"，再"让模型基于证据作答"，
 * 可以显著减少幻觉，让回答有据可依。
 */

import 'dotenv/config'
// ChatOpenAI：用于调用兼容 OpenAI API 格式的聊天模型（大模型）
// OpenAIEmbeddings：用于将文本转换为向量（检索用）
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai'
import { MilvusClient, MetricType } from '@zilliz/milvus2-sdk-node'
// RunnableLambda：把普通函数封装成 Runnable，使其能参与链式组合
// RunnableSequence：按顺序串联多个 Runnable，前一个的输出作为后一个的输入
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables'
// PromptTemplate：负责把提示词模板和实际输入组合成完整提示词
import { PromptTemplate } from '@langchain/core/prompts'
import chalk from 'chalk'
// StringOutputParser：把模型的 AIMessage 输出转换成纯文本字符串
import { StringOutputParser } from '@langchain/core/output_parsers'

// ==================== 配置常量 ====================
// Milvus 集合名称（存储电子书向量数据的表）
const COLLECTION_NAME = "ebook_collection"
// 向量维度，必须和入库时（ebook-writer.mjs）的嵌入维度一致
const VECTOR_DIMENSION = 1024
// Milvus 服务地址（本地 Docker 启动）
const MILVUS_ADDRESS = "localhost:19530"

// 创建聊天模型实例，负责最终回答生成。
const model = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.MODEL_NAME,
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL
    },
    temperature: 0.7
})

// 创建嵌入模型实例，负责把文本转为向量。
// 注意：检索用的嵌入模型必须与入库时（ebook-writer.mjs）使用同一个模型，
// 否则查询向量和库中向量的语义空间不一致，检索会失效。
const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    // EMBEDDINGS_MODEL_NAME：嵌入模型名称（DashScope 用 text-embedding-v3）。
    model: process.env.EMBEDDINGS_MODEL_NAME,

    configuration: {
        baseURL: process.env.OPENAI_BASE_URL
    },
    // 显式指定向量维度，与 VECTOR_DIMENSION 保持一致。
    dimensions: VECTOR_DIMENSION
})

// 创建 Milvus 向量数据库客户端。
const milvusClient = new MilvusClient({ address: MILVUS_ADDRESS })

// 封装"文本 → 向量"的转换逻辑。
// embedQuery 用于把查询文本转成一个向量（单条）。
const getEmbedding = async (text) => {
    const embedding = await embeddings.embedQuery(text)
    return embedding
}

// 从 Milvus 中检索相关内容 Runnable。
//
// 输入：{ question, k }
// 输出：{ question, retrievedContent }（检索到的片段数组）
//
// 这一环节是 RAG 的核心：用向量相似度代替关键词匹配，
// 找出语义上最接近用户问题的文本片段。
const milvusSearch = new RunnableLambda({
    func: async (input) => {
        // k 表示返回几条最相关的片段，默认 5 条。
        const { question, k = 5 } = input
        try {
            // 1. 生成问题向量：把用户问题转成向量形式。
            const queryVector = await getEmbedding(question)
            // 2. 调用 Milvus 搜索：用问题向量去集合里做相似度检索。
            const searchResults = await milvusClient.search({
                // 要搜索的集合名。
                collection_name: COLLECTION_NAME,
                // 查询向量。
                vector: queryVector,
                // 距离度量方式：COSINE 余弦相似度（与入库时一致）。
                metric_type: MetricType.COSINE,
                // 返回前 k 条最相似的结果。
                limit: k,
                // 除了默认字段外，还需要返回这些字段，供后续拼 context。
                output_fields: ['id', 'book_id', 'chapter_num', 'index', 'content']
            })

            // Milvus 查询结果可能为空，这里做一次空值保护。
            const results = searchResults.results ?? []
            // 把原始查询结果整理成更易使用的结构，保留元信息和相似度分数。
            const retrievedContent = results.map((item, idx) => ({
                id: item.id,
                book_id: item.book_id,
                chapter_num: item.chapter_num,
                index: item.index,
                content: item.content,
                score: item.score,
            }))
            return { question, retrievedContent }
        } catch (error) {
            // 检索失败时不中断整个链，返回空结果，交给后续兜底逻辑处理。
            console.error('Milvus 搜索失败:', error)
            return { question, retrievedContent: [] }
        }
    },
})

// PromptTemplate：负责把 context/question 拼接成最终的 prompt。
//
// {context}：检索到的相关片段拼接成的长文本。
// {question}：用户原始问题。
// 模板里还写了详细的回答要求，引导模型只基于片段内容作答，
// 从而减少臆造。
const promptTemplate = PromptTemplate.fromTemplate(
    `你是一个专业的《倚天屠龙记》小说助手。基于小说内容回答问题，用准确、详细的语言。

请根据以下《倚天屠龙记》小说片段内容回答问题：
{context}

用户问题: {question}

回答要求：
1. 如果片段中有相关信息，请结合小说内容给出详细、准确的回答
2. 可以综合多个片段的内容，提供完整的答案
3. 如果片段中没有相关信息，请如实告知用户
4. 回答要准确，符合小说的情节和人物设定
5. 可以引用原文内容来支持你的回答

AI 助手的回答:`
)

// 构建 prompt 输入 + 日志打印的 Runnable。
//
// 输入：{ question, retrievedContent }
// 输出：{ question, context, hasContent, retrievedContent }
//
// 作用有两个：
// 1. 把多条检索片段拼接成一段 context 文本，供 promptTemplate 使用
// 2. 在终端打印检索到的片段，方便直观查看"模型看到了什么"
const buildPromptInput = new RunnableLambda({
    func: async (input) => {
        const { question, retrievedContent } = input
        // 如果没有任何检索结果，标记 hasContent = false，
        // 让后续环节直接返回兜底回答，不再调用大模型。
        if (!retrievedContent || retrievedContent.length === 0) {
            return {
                hasContent: false,
                question,
                context: '',
                retrievedContent
            }
        }

        // 打印检索结果，方便观察每个片段的来源和相似度。
        console.log(chalk.blue('-'.repeat(50)))
        console.log(chalk.green('问题:', question))
        console.log(chalk.blue('-'.repeat(50)))
        console.log(chalk.red('检索相关内容'))

        retrievedContent.forEach((item, idx) => {
            console.log(chalk.yellow(`片段 ${idx + 1} 相似度：${item.score}`))
            console.log(chalk.yellow(`书籍：${item.book_id}`))
            console.log(chalk.yellow(`章节：第${item.chapter_num}章`))
            console.log(chalk.yellow(`索引：${item.index}`))
            console.log(chalk.yellow(`内容：${(item.content ?? '').substring(0, 200) + '...' + (item.content ?? '').substring(item.content?.length - 200)}`))
        })

        // 把多条片段内容用换行拼成一段长文本，作为 prompt 的 context。
        const context = retrievedContent.map(item => item.content).join('\n')
        return {
            hasContent: true,
            question,
            context,
            retrievedContent
        }
    },
})

// 组合成完整的 Runnable 链。
//
// 数据流转（每一步的输出就是下一步的输入）：
// 1. milvusSearch：       { question }           → { question, retrievedContent }
// 2. buildPromptInput：   { question, ... }      → { question, context, hasContent }
// 3. 判断 Runnable：      有结果则透传，无结果直接返回兜底回答
// 4. promptTemplate：     { question, context }  → 完整提示词文本
// 5. model：              提示词文本             → AIMessage
// 6. StringOutputParser： AIMessage             → 纯文本字符串
const ragChain = RunnableSequence.from([
    // 步骤 1：检索相关内容（Milvus 向量搜索）。
    milvusSearch,
    // 步骤 2：构建 prompt 输入并打印检索详情。
    buildPromptInput,
    // 步骤 3：判断是否有检索结果，决定是走"正常回答"还是"兜底回答"。
    new RunnableLambda({
        func: async (input) => {
            const { hasContent, question, context } = input
            // 没有检索到内容时，直接返回兜底文案，不再浪费一次模型调用。
            if (!hasContent) {
                const fallbackResponse = '未找到相关片段，无法回答问题。'
                console.log(chalk.red(fallbackResponse))
                return {
                    answer: fallbackResponse,
                    question,
                    context: '',
                    noContext: true
                }
            }
            // 有内容则继续往下走，把 question 和 context 交给 PromptTemplate。
            // 注意：这里只透传 PromptTemplate 需要的字段，多余的字段会被忽略。
            return { question, context, noContext: false }
        }
    }),
    // 步骤 4：把 {context} 和 {question} 填充进提示词模板，生成完整提示词。
    promptTemplate,
    // 步骤 5：调用大模型，让模型基于检索到的片段生成回答。
    model,
    // 步骤 6：把模型返回的 AIMessage 转成纯文本字符串。
    new StringOutputParser()
])

// 初始化 Milvus 连接和集合加载（在真正查询前执行一次）。
async function initMilvusCollection() {
    console.log(chalk.blue('连接到 Milvus 服务...'))
    // connectPromise：等待连接建立完成。
    await milvusClient.connectPromise
    console.log(chalk.green('Milvus 服务连接成功'))

    try {
        // 把集合加载到内存，加载后向量搜索才有数据可查。
        await milvusClient.loadCollection({
            collection_name: COLLECTION_NAME
        })
        console.log(chalk.green('集合加载成功'))
    } catch (error) {
        // 集合已处于加载状态时，Milvus 会报 "already loaded" 错误，忽略即可。
        if (!error.message.includes("already loaded")) {
            throw error;
        }
        console.log(chalk.yellow("集合已处于加载状态"));
    }

}

// 运行 RAG 链的入口函数。
async function runRagChain(input) {
    try {
        await initMilvusCollection()



        console.log(chalk.blue('-'.repeat(50)))
        console.log(chalk.green('问题:', input.question))
        console.log(chalk.blue('-'.repeat(50)))
        console.log(chalk.red('[AI开始流式输出回答]'))
        // ragChain.stream(input) 以流式方式调用整条链。
        // 模型会边生成边返回 chunk，这里实时打印，模拟打字机效果。
        const stream = await ragChain.stream(input)
        for await (const chunk of stream) {
            process.stdout.write(chunk)
        }
    } catch (error) {
        console.error('运行 RAG 链失败:', error)
    }
}
// 执行入口：提问并获取回答。
await runRagChain({
    question: '张三丰会哪些武功',
    k: 5
})