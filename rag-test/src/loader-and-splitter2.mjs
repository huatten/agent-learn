// ========== 【RAG 完整示例：从网页加载到问答】 ==========
// 本示例演示完整的 RAG（检索增强生成）工作流程：
// 1. 📥 从网页自动加载文章内容（使用 Cheerio 爬虫）
// 2. ✂️ 将长文本分割成小块（为什么要分割？太长会超出 token 限制，且检索不精准）
// 3. 🔢 将每个文本块转换成向量存入内存向量库
// 4. 🔍 用户提问 → 语义搜索找到最相关的文本片段
// 5. 🤖 将检索结果交给 AI，AI 基于文章内容回答问题

// 加载环境变量：从 .env 文件读取 API Key 等配置
import "dotenv/config";
// cheerio：HTML 解析库，用于提取网页正文
import "cheerio";
// CheerioWebBaseLoader：LangChain 封装的网页加载器，自动抓取 + 解析网页
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
// RecursiveCharacterTextSplitter：递归字符文本分割器
// 按分隔符递归切割文本，保证每个块大小在 chunkSize 范围内
import  { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
// ChatOpenAI：大语言模型封装，OpenAI 兼容接口都能用
// OpenAIEmbeddings：文本嵌入模型封装，把文本转成向量
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
// MemoryVectorStore：内存向量存储，把向量存在内存里
// 适合小型演示、测试，生产环境建议使用持久化向量数据库（如 Pinecone、Chroma、Milvus 等）
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

// ========== 1. 初始化大语言模型 ==========
// 阿里云百炼（通义千问）兼容 OpenAI 接口格式，所以可以直接用 ChatOpenAI
const model = new ChatOpenAI({
    model: process.env.MODEL_NAME,        // 模型名称，从 .env 读取
    apiKey: process.env.OPENAI_API_KEY,    // API 密钥，从 .env 读取
    configuration:{
        baseURL: process.env.OPENAI_BASE_URL,  // 自定义 API 地址（阿里云百炼）
    },
    temperature: 0,  // 温度设为 0，输出更确定稳定，适合问答任务
});

// ========== 2. 初始化嵌入模型 ==========
// 嵌入模型作用：把自然语言文本转换成高维向量（数组）
// 语义相似的文本，生成的向量在空间上距离更近
// 这样就能通过计算向量距离实现"语义搜索"，而不仅仅是关键词匹配
const embeddings = new OpenAIEmbeddings({
    model: process.env.EMBEDDINGS_MODEL_NAME,  // 嵌入模型名称，从 .env 读取
    apiKey: process.env.OPENAI_API_KEY,
    configuration:{
        baseURL: process.env.OPENAI_BASE_URL,
    },
    // ⚠️ 【重要坑点】阿里云百炼 embedding API 限制：单次批量请求最大 10 个文本
    // 默认 LangChain batchSize = 512，直接超过限制报错：
    // "batch size is invalid, it should not be larger than 10"
    // 所以必须手动设置 batchSize = 10
    batchSize: 10,
});

// ========== 3. 从网页加载文章 ==========
// 创建网页加载器：指定 URL 和 CSS 选择器
// selector: ".main-area" 表示只提取掘金文章主体，去掉导航、侧边栏、评论区等无关内容
const cheerioLoader = new CheerioWebBaseLoader(
  "https://juejin.cn/post/7589494631006683171",
    {
        selector: ".main-area",
    }
);

// 加载并解析网页，返回 Document 对象数组
// 一篇文章对应一个 Document，所以数组长度是 1
const documents = await cheerioLoader.load();

// ========== 4. 分割长文本 ==========
// 🤔 为什么要分割长文本？
//  1. 嵌入模型有最大 token 限制，太长放不下
//  2. 长文章通常包含多个主题，整块检索会混入不相关内容
//  3. LLM 上下文窗口有限，只放最相关的几个小块能节省空间，聚焦重点
const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 400,      // 每个分块大约多少字符（中文 token 数 ≈ 字符数 / 1.3）
    chunkOverlap: 50,    // 相邻分块重叠多少字符，避免一句话被切断破坏语义
    separators: ["。","！","问号"],  // 优先按这些分隔符分割，尽量保持句子完整
});

// 执行分割：输入 Document 数组，输出分割后的 Document 数组
const splitDocuments = await textSplitter.splitDocuments(documents);

console.log(`文档分割完成，共${splitDocuments.length}个分块\n`);

// ========== 5. 创建向量存储 ==========
// MemoryVectorStore.fromDocuments 自动完成：
//  1. 提取所有分块的文本
//  2. 分批调用嵌入模型，把每个文本转换成向量
//  3. 将（文档 + 向量）存储在内存中
console.log("开始创建向量存储...");
const vectorStore = await MemoryVectorStore.fromDocuments(splitDocuments, embeddings);
console.log("向量存储创建完成！");

// ========== 6. 创建检索器 ==========
// 把向量存储转换成检索器，k=2 表示每次返回最相关的前 2 个文档
const retriever = vectorStore.asRetriever({ k: 2});

// ========== 7. RAG 问答流程 ==========
// 定义问题数组，可以放多个问题依次回答
const questions = ["无意义的工作就是在浪费生命？"];

// 遍历每个问题执行 RAG
for (const question of questions){
    console.log(`\n问题：${question}`);

    // ========== 第一步：检索（Retrieval） ==========
    // 调用检索器：内部自动完成
    //  1. 对问题文本做 embedding 得到问题向量
    //  2. 在向量存储中计算问题向量和每个文档向量的距离
    //  3. 按距离排序，返回最相关的 top k 个文档
    const retrievedDocs = await retriever.invoke(question);

    // 获取带分数的检索结果，用于展示相似度
    // ⚠️ 注意：similaritySearchVectorWithScore 的第一个参数必须是**已经 embedding 好的向量**，不能直接传问题字符串
    // 所以我们先手动对问题做 embedding，再传入
    const embeddedQuestion = await embeddings.embedQuery(question);
    // similaritySearchVectorWithScore 返回格式：[ [doc, distance], ... ]
    // distance 是向量距离，越小表示越相似
    const scoredResults = await vectorStore.similaritySearchVectorWithScore(embeddedQuestion, 2);
    console.log("\n【检索到的文档及相似度评分】");

    // 遍历打印检索结果：相似度 + 内容 + 元数据
    retrievedDocs.forEach((doc, index) => {
        // 在 scoredResults 中找到当前文档对应的距离
        const scoredResult = scoredResults.find(([scoredDoc]) => scoredDoc.pageContent === doc.pageContent);
        const distance = scoredResult ? scoredResult[1] : null;
        // 转换距离 → 相似度：相似度 = 1 - 距离
        // 结果范围：0 ~ 1，越接近 1 表示越相关
        const similarity = distance !== null ? (1 - distance).toFixed(4) : "N/A";
        console.log(`\n[文档${index +1}] 相似度:${similarity}`);
        console.log(`内容:${doc.pageContent}`);
        // 输出元数据，包含来源 URL、位置等信息
        if(doc.metadata && Object.keys(doc.metadata).length > 0) {
            console.log(`元数据:`, doc.metadata);
        }
    });

    // ========== 第二步：生成（Generation） ==========
    // 把检索到的文档拼接成上下文，放入 Prompt
    const context = retrievedDocs
        .map((doc, i) =>`[片段${i +1}]\n${doc.pageContent}`)
        .join("\n\n━━━━━\n\n");

    // 构建完整 Prompt：指定角色 + 提供上下文 + 给出问题
    const prompt =`你是一个文章辅助阅读助手，根据文章内容来解答：

文章内容：
${context}

问题:${question}

你的回答:`;

    // 调用大模型生成最终回答
    console.log("\n【AI 回答】");
    const response = await model.invoke(prompt);
    console.log(response.content);
    console.log("\n");
}
