import "dotenv/config"
import { OpenAIEmbeddings } from "@langchain/openai"
import { PromptTemplate, FewShotPromptTemplate } from "@langchain/core/prompts";
import { SemanticSimilarityExampleSelector } from "@langchain/core/example_selectors";
import { Milvus } from '@langchain/community/vectorstores/milvus';

// 这个文件演示的是 SemanticSimilarityExampleSelector。
//
// example-selector1.mjs 用的是 LengthBasedExampleSelector：
// 它按长度预算选示例，主要解决“别让 prompt 太长”的问题。
//
// 这个文件用的是语义相似度选择器：
// 它会根据当前用户场景 current_scenario，
// 去向量库里找“语义上最接近”的 few-shot 示例。
//
// 典型流程是：
// 1. 先把大量示例写入向量库 Milvus
// 2. 每条示例都提前生成 embedding 向量
// 3. 当前 query 也生成 embedding
// 4. 在 Milvus 里按向量相似度检索最相近的 k 条示例
// 5. 把选中的示例放进 FewShotPromptTemplate
//
// 这个方式更适合真实项目：
// 示例很多时，不用每次全塞进 prompt，
// 而是按当前问题自动挑最相关的几条。

// Milvus 集合名称。
// 这个集合需要提前存在，并且里面已经写入周报示例数据。
// 对应写入脚本是 weekly-report-examples-writer-milvus.mjs。
const COLLECTION_NAME = 'weekly_report_examples';

// embedding 向量维度。
// 这里要和写入 Milvus 时使用的维度保持一致，否则查询会失败。
const VECTOR_DIMENSION = 1024

// 本地 Milvus 服务地址。
// 默认端口通常是 19530。
const MILVUS_ADDRESS = "localhost:19530"

// 创建 embedding 模型。
//
// SemanticSimilarityExampleSelector 需要 embedding：
// - 用它把当前场景文本变成向量
// - 再用向量去 Milvus 里查相似示例
const embeddings = new OpenAIEmbeddings({
    // OPENAI_API_KEY：访问 embedding 服务的密钥。
    apiKey: process.env.OPENAI_API_KEY,

    // EMBEDDINGS_MODEL_NAME：embedding 模型名称。
    // 注意要和写入示例时使用的模型保持一致。
    model: process.env.EMBEDDINGS_MODEL_NAME,

    configuration: {
        // OPENAI_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_BASE_URL
    },

    // 指定输出向量维度。
    dimensions: VECTOR_DIMENSION
});


// 定义单条示例 Prompt 模板。
//
// 从 Milvus 查回来的每条示例，包含：
// - scenario：示例对应的场景描述
// - report_snippet：示例周报片段
//
// 这些字段会被填进 examplePrompt，再拼入最终 few-shot prompt。
const examplePrompt = PromptTemplate.fromTemplate(
    `用户场景：{scenario}
    生成的周报片段：
    {report_snippet}
    ---`
);

// 连接 Milvus，并基于已存在的集合创建向量库。
//
// 注意：这里用的是 fromExistingCollection，
// 说明集合应该已经提前创建并写入数据。
//
// 如果还没有写入示例，需要先运行：
// weekly-report-examples-writer-milvus.mjs
const vectorStore = await Milvus.fromExistingCollection(embeddings, {
    // 要连接的 Milvus collection。
    collectionName: COLLECTION_NAME,

    // Milvus 客户端连接配置。
    clientConfig:{
        address: MILVUS_ADDRESS
    },

    // 查询和索引相关配置。
    //
    // index_type: IVF_FLAT 是一种常见向量索引方式。
    // metric_type: COSINE 表示用余弦相似度衡量文本语义接近程度。
    indexCreateOptions:{
        index_type: 'IVF_FLAT',
        metric_type: 'COSINE',
        params: { nlist: 1024 },
        search_params: {
            nprobe: 10,
        },
    }
})

// 创建语义相似度示例选择器。
//
// 它会基于 vectorStore 做相似度搜索。
const exampleSelector = new SemanticSimilarityExampleSelector({
    // 向量库，用来检索相似示例。
    vectorStore,

    // 每次只选语义最相近的 2 条示例。
    // k 越大，prompt 里示例越多，参考更充分，但 token 消耗也更高。
    k: 2, // 每次只选出语义上最相近的 2 条示例
})

// 用 selector 构建 FewShotPromptTemplate。
//
// 和普通 FewShotPromptTemplate 的区别：
// - 普通写法：直接传 examples，所有示例都会进 prompt
// - 这里写法：传 exampleSelector，每次动态检索最相关示例
const fewShotPrompt = new FewShotPromptTemplate({
    // 单条示例的格式。
    examplePrompt,

    // 语义示例选择器。
    exampleSelector,

    // 所有被选中示例前面的说明。
    prefix:
        '下面是一些不同类型的周报示例，你可以从中学习语气和结构（系统会自动从 Milvus 选出和当前场景最相近的示例）：\n',

    // 被选中示例后面的新任务。
    //
    // {current_scenario} 会作为本次输入，
    // 同时也会被 selector 用来做相似度检索。
    suffix:
        '\n\n现在请根据上面的示例风格，为下面这个场景写一份新的周报：\n' +
        '场景描述：{current_scenario}\n' +
        '请输出一份适合发给老板和团队同步的 Markdown 周报草稿。',

    // 当前模板需要的输入变量。
    inputVariables: ['current_scenario'],
})

// 演示：给定两个不同的场景描述，让 selector 挑出语义上最接近的示例。
//
// 场景 1：技术债清理为主。
// 理论上它应该更容易匹配到“技术债、重构、单测、文档、老系统拆分”相关示例。
const currentScenario1 =
    '我们本周主要是在清理历史技术债：重构老旧的订单模块、补齐核心接口的单测，' +
    '同时也完善了一些文档，方便后面新人接手。整体没有对外大范围发布的新功能。';

// 场景 2：语义明显不同，偏“首发上线 + 对外宣传”。
// 理论上它应该更容易匹配到“新功能上线、运营看板、对外展示、跨部门宣讲”相关示例。
const currentScenario2 =
    '本周完成新一代运营看板的首批功能上线，重点打通埋点和实时数仓链路，' +
    '并面向运营和市场同学做了多场宣讲，希望更多同学开始使用新能力。';

console.log('\n===== 场景 1：技术债清理为主 =====\n');

// 格式化第一个场景的 few-shot prompt。
//
// 在这一步，FewShotPromptTemplate 会调用 exampleSelector：
// 1. 把 current_scenario 转成 embedding
// 2. 去 Milvus 里找最相近的 2 条示例
// 3. 用 examplePrompt 格式化这些示例
// 4. 拼成最终 prompt
const finalPrompt1 = await fewShotPrompt.format({
    current_scenario: currentScenario1,
});
console.log(finalPrompt1);

console.log('\n\n===== 场景 2：新功能首发 + 对外宣传 =====\n');

// 格式化第二个场景的 few-shot prompt。
// 由于语义不同，选出来的示例应该和场景 1 不一样。
const finalPrompt2 = await fewShotPrompt.format({
    current_scenario: currentScenario2,
});
console.log(finalPrompt2);
