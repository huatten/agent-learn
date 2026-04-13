// ========== 【RAG 完整入门示例】 ==========
// RAG = Retrieval-Augmented Generation（检索增强生成）
// 核心流程：用户提问 → 从知识库检索相关文档 → 把检索结果给 AI → AI 基于文档回答
// 优势：减少幻觉，可以回答私有知识库中的问题

// ========== 1. 导入依赖和环境配置 ==========
// 加载环境变量：dotenv 会自动读取项目根目录下的 .env 文件
// 把其中的配置注入到 process.env 环境变量中，代码就可以读取了
import "dotenv/config";

// 从 LangChain 官方包导入需要的组件：
// - ChatOpenAI: 大语言模型封装（支持所有兼容 OpenAI 接口格式的服务商）
// - OpenAIEmbeddings: 文本嵌入模型封装（把文本转换成向量）
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
// Document: LangChain 标准文档对象，包含文本内容和元数据
import { Document } from "@langchain/core/documents";
// MemoryVectorStore: 内存向量存储，把向量存在内存中
// 适合小规模演示、测试，不适合生产环境大量数据
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

// ========== 2. 初始化大语言模型 ==========
// 创建聊天大模型实例
// 由于阿里云百炼（通义千问）兼容 OpenAI 接口格式，所以可以直接用 ChatOpenAI
const model = new ChatOpenAI({
    // 模型名称，从环境变量读取（你现在用的是 qwen-plus）
    model: process.env.MODEL_NAME,
    // API 密钥，从环境变量读取，用于身份认证
    apiKey: process.env.OPENAI_API_KEY,
    // 第三方兼容 OpenAI 接口需要配置自定义 baseURL
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// ========== 3. 初始化嵌入模型（Embedding） ==========
// 嵌入模型的作用：把文本转换成高维向量（一维数组）
// 语义相似的文本，转换后的向量在空间上距离更近
// 这样我们就可以通过计算向量距离来"语义搜索"和问题相关的文档
const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    // 嵌入模型名称，从环境变量读取（你现在用的是 text-embedding-v4）
    model: process.env.EMBEDDINGS_MODEL_NAME,
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL
    },
});

// ========== 4. 准备知识库文档 ==========
// 这里我们把一个完整故事分成了 7 个片段，每个片段是一个 Document
// Document = 文本内容 + 元数据
// 元数据可以存储任何你需要的信息，比如这里的章节、角色、类型等
// 方便后续过滤、排序和展示
const documents = [
    new Document({
        // pageContent: 文档的文本内容（必须字段）
        pageContent: `光光是一个活泼开朗的小男孩，他有一双明亮的大眼睛，总是带着灿烂的笑容。光光最喜欢的事情就是和朋友们一起玩耍，他特别擅长踢足球，每次在球场上奔跑时，就像一道阳光一样充满活力。`,
        // metadata: 元数据（可选，自定义字段）
        metadata: {
            chapter: 1,
            character: "光光",
            type: "角色介绍",
            mood: "活泼"
        },
    }),
    new Document({
        pageContent: `东东是光光最好的朋友，他是一个安静而聪明的男孩。东东喜欢读书和画画，他的画总是充满了想象力。虽然性格不同，但东东和光光从幼儿园就认识了，他们一起度过了无数个快乐的时光。`,
        metadata: {
            chapter: 2,
            character: "东东",
            type: "角色介绍",
            mood: "温馨"
        },
    }),
    new Document({
        pageContent: `有一天，学校要举办一场足球比赛，光光非常兴奋，他邀请东东一起参加。但是东东从来没有踢过足球，他担心自己会拖累光光。光光看出了东东的担忧，他拍着东东的肩膀说："没关系，我们一起练习，我相信你一定能行的！"`,
        metadata: {
            chapter: 3,
            character: "光光和东东",
            type: "友情情节",
            mood: "鼓励",
        },
    }),
    new Document({
        pageContent: `接下来的日子里，光光每天放学后都会教东东踢足球。光光耐心地教东东如何控球、传球和射门，而东东虽然一开始总是踢不好，但他从不放弃。东东也用自己的方式回报光光，他画了一幅画送给光光，画上是两个小男孩在球场上一起踢球的场景。`,
        metadata: {
            chapter: 4,
            character: "光光和东东",
            type: "友情情节",
            mood: "互助",
        },
    }),
    new Document({
        pageContent: `比赛那天终于到了，光光和东东一起站在球场上。虽然东东的技术还不够熟练，但他非常努力，而且他用自己的观察力帮助光光找到了对手的弱点。在关键时刻，东东传出了一个漂亮的球，光光接球后射门得分！他们赢得了比赛，更重要的是，他们的友谊变得更加深厚了。`,
        metadata: {
            chapter: 5,
            character: "光光和东东",
            type: "高潮转折",
            mood: "激动",
        },
    }),
    new Document({
        pageContent: `从那以后，光光和东东成为了学校里最要好的朋友。光光教东东运动，东东教光光画画，他们互相学习，共同成长。每当有人问起他们的友谊，他们总是笑着说："真正的朋友就是互相帮助，一起变得更好的人！"`,
        metadata: {
            chapter: 6,
            character: "光光和东东",
            type: "结局",
            mood: "欢乐",
        },
    }),
    new Document({
        pageContent: `多年后，光光成为了一名职业足球运动员，而东东成为了一名优秀的插画师。虽然他们走上了不同的道路，但他们的友谊从未改变。东东为光光设计了球衣上的图案，光光在每场比赛后都会给东东打电话分享喜悦。他们证明了，真正的友情可以跨越时间和距离，永远闪闪发光。`,
        metadata: {
            chapter: 7,
            character: "光光和东东",
            type: "尾声",
            mood: "温馨",
        },
    }),
];

// ========== 5. 创建向量存储 ==========
// MemoryVectorStore.fromDocuments 会自动帮你做这些事情：
// 1. 提取所有文档的文本内容
// 2. 调用嵌入模型，把每个文本转换成向量
// 3. 把文档 + 向量一起存储在内存中
const vectorStore = await MemoryVectorStore.fromDocuments(
    documents,  // 文档数组
    embeddings   // 嵌入模型实例
);

// ========== 6. 创建检索器 ==========
// 把向量存储转换成检索器，方便后续调用
// k: 3 表示每次检索返回最相关的前 3 个文档
const retriever = vectorStore.asRetriever({ k: 3 });

// ========== 7. RAG 问答流程 ==========
// 定义要问的问题，可以放多个
const questions = [
    "东东和光光是怎么成为朋友的？"
];

// 遍历每个问题，执行 RAG
for (const question of questions) {

    // 打印分隔线，让输出更清晰易读
    console.log("=".repeat(80));
    console.log(`问题: ${question}`);
    console.log("=".repeat(80));

    // ========== 第一步：检索（Retrieval） ==========
    // 使用检索器根据问题语义检索最相关的文档
    // 内部流程：
    // 1. 把问题文本传给嵌入模型，得到问题向量
    // 2. 在向量存储中计算问题向量和每个文档向量的相似度
    // 3. 按相似度从高到低排序，返回 top k 个文档
    const retrievedDocs = await retriever.invoke(question);

    // 获取带相似度分数的检索结果
    // similaritySearchWithScore 返回格式是 [ [文档, 距离分数], ... ]
    // 重要说明：LangChain 这里的分数是"距离"，不是"相似度"
    // 距离 = 1 - 相似度，所以距离越小，相似度越高
    const scoredResults = await vectorStore.similaritySearchWithScore(question, 3);

    // 遍历打印每个检索到的文档
    // 同时输出相似度，方便新手理解哪些文档和问题更相关
    retrievedDocs.forEach((doc, index) => {
        // 在 scoredResults 找到当前文档对应的距离分数
        const scoredResult = scoredResults.find(([scoredDoc]) =>
            scoredDoc.pageContent === doc.pageContent
        );
        const score = scoredResult ? scoredResult[1] : null;
        // 把距离转换成相似度：相似度 = 1 - 距离
        // 结果范围 0~1，越接近 1 表示越相关
        const similarity = score !== null ? (1 - score).toFixed(4) : "N/A";

        console.log(`\n[文档 ${index + 1}] 相似度: ${similarity}`);
        console.log(`内容: ${doc.pageContent}`);
        console.log(`元数据: 章节=${doc.metadata.chapter}, 角色=${doc.metadata.character}, 类型=${doc.metadata.type}, 心情=${doc.metadata.mood}`);
    });

    // ========== 第二步：生成（Generation） ==========
    // 把检索到的文档拼接成上下文
    const context = retrievedDocs
        .map((doc, i) => `[片段${i + 1}]\n${doc.pageContent}`)
        .join("\n\n━━━━━\n\n");

    // 构建完整的 Prompt：
    // - 给 AI 指定角色（一个讲友情故事的老师）
    // - 提供检索到的上下文（故事片段）
    // - 告诉 AI 问题是什么
    // - 给 AI 指令：如果故事里没提到就直说
    const prompt = `你是一个讲友情故事的老师。基于以下故事片段回答问题，用温暖生动的语言。如果故事中没有提到，就说"这个故事里还没有提到这个细节"。

故事片段:
${context}

问题: ${question}

老师的回答:`;

    // 调用大模型生成最终回答
    console.log("\n【AI 回答】");
    const response = await model.invoke(prompt);
    console.log(response.content);
    console.log("\n");
}
