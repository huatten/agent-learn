import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { JsonOutputParser } from "@langchain/core/output_parsers";

// 这个文件演示的是 LangChain 的 JsonOutputParser：
// 1. 不再完全依赖自己手写「请返回 JSON」
// 2. 通过 parser.getFormatInstructions() 让 LangChain 生成更明确的格式要求
// 3. 通过 parser.parse() 把模型返回内容解析成 JavaScript 对象
// 可以把它理解成 normal.mjs 的升级版：还是 JSON，但解析过程交给 parser 管理。

// 创建一个聊天模型实例。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称。
    model: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    apiKey: process.env.OPENAI_API_KEY,

    // 结构化输出需要稳定性，所以这里依然把 temperature 设置为 0。
    temperature: 0,

    configuration: {
        // OPENAI_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 创建 JSON 输出解析器。
// JsonOutputParser 的作用有两个：
// 1. 提供格式说明：告诉模型应该怎样返回 JSON
// 2. 解析模型输出：把字符串结果转成 JavaScript 对象
const parser = new JsonOutputParser();

// 这里使用模板字符串，是为了把 parser.getFormatInstructions() 拼进 prompt。
// getFormatInstructions() 会生成一段格式说明，通常比我们手写「请返回 JSON」更清楚。
//
// 注意：JsonOutputParser 只强调「返回 JSON」，
// 但它不像 zod schema 那样严格约束字段类型和字段含义。
const question = `请介绍一下爱因斯坦的信息。请以 JSON 格式返回，包含以下字段：name（姓名）、birth_year（出生年份）、nationality（国籍）、major_achievements（主要成就，数组）、famous_theory（著名理论）。
${parser.getFormatInstructions()}`;

// 打印最终发给模型的完整 prompt。
// 学习时建议看一眼这里，可以理解 parser 到底帮我们追加了什么格式要求。
console.log('question:',question)

try {
    console.log("🤔 正在调用大模型（使用 JsonOutputParser）...\n");

    // invoke 会把 question 发给模型，并等待完整响应。
    const response = await model.invoke(question);

    console.log("📤 模型原始响应:\n");

    // 先打印原始响应，方便对比：
    // 模型返回的是字符串，parser.parse 之后才会变成对象。
    console.log(response.content);
    console.log("----------------------------分割线----------------------------")

    // 使用 JsonOutputParser 解析模型返回内容。
    // 和 normal.mjs 里的 JSON.parse 类似，但这里使用的是 LangChain 提供的解析器。
    // 如果模型返回的内容不是合法 JSON，这里同样可能抛出错误。
    const result = await parser.parse(response.content);

    console.log("🔧 JsonOutputParser后响应:\n", result);

    // 解析成功后，result 就是普通 JavaScript 对象。
    // 下面这些打印可以帮助你确认每个字段是否真的按预期返回。
    console.log(`姓名: ${result.name}`);
    console.log(`出生年份: ${result.birth_year}`);
    console.log(`国籍: ${result.nationality}`);
    console.log(`著名理论: ${result.famous_theory}`);
    console.log(`主要成就:`, result.major_achievements);
}catch (error) {
    // 常见错误场景：
    // 1. .env 配置不正确，导致模型调用失败
    // 2. 模型返回的不是合法 JSON，导致 parser.parse 失败
    // 3. 字段缺失或类型不符合预期，需要在后续代码里自己判断
    console.error("❌ 错误:", error.message);
}
