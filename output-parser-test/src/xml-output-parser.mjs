import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import {XMLOutputParser } from "@langchain/core/output_parsers";

// 这个文件演示的是 XML 格式的 Output Parser。
//
// 前面我们说过：
// 如果只是想拿 JSON 结构化对象，withStructuredOutput / tool call 通常更省心。
// 但它们本质上更适合“工具参数对象”这种 JSON-like 的结构。
//
// XML、YAML、CSV 这类非 JSON 文本格式，就不是 tool call 最适合处理的场景。
// 这时候 Output Parser 仍然很有价值：
// 1. parser.getFormatInstructions() 会把 XML 格式要求写进 prompt
// 2. 模型按要求返回 XML 文本
// 3. parser.parse() 再把 XML 文本解析成 JavaScript 能使用的数据结构

// 创建一个聊天模型实例。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称。
    model: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    apiKey: process.env.OPENAI_API_KEY,

    // 解析 XML 时也希望模型稳定地按格式输出，所以设置为 0。
    temperature: 0,

    configuration: {
        // OPENAI_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 创建 XML 输出解析器。
// 它和 JsonOutputParser 的思路类似：
// - getFormatInstructions()：告诉模型要返回什么样的 XML
// - parse()：把模型返回的 XML 字符串解析成对象/数组结构
const parser = new XMLOutputParser();

// 把 XML parser 生成的格式说明拼进 prompt。
// 学习时可以重点打印 question 看一下：
// parser 会给模型追加一些 XML 相关的输出要求。
const question = `请提取以下文本中的人物信息：阿尔伯特·爱因斯坦出生于 1879 年，是一位伟大的物理学家。

${parser.getFormatInstructions()}`;

// 打印最终提示词，方便观察 XMLOutputParser 到底加了哪些格式要求。
console.log('question:', question);

try {
    console.log("🤔 正在调用大模型（使用 XMLOutputParser）...\n");

    // invoke 会把完整 question 发给模型，并等待完整响应。
    const response = await model.invoke(question);

    console.log("📤 模型原始响应:\n");

    // 这里打印的是模型返回的原始 XML 文本。
    // 先看原文，再看 parser.parse 后的结果，最容易理解解析器做了什么。
    console.log(response.content);

   // 使用 XMLOutputParser 解析 XML 文本。
   // 如果模型返回的不是合法 XML，或者标签结构不符合 parser 预期，这里可能会报错。
   const result = await parser.parse(response.content);

    console.log("\n✅ XMLOutputParser 自动解析的结果:\n");

    // 解析后的 result 就不再是 XML 字符串，而是 JavaScript 数据结构。
    // 这就是 Output Parser 的核心价值：把非 JSON 文本格式转成程序更容易使用的数据。
    console.log(result);
}catch (error) {
    // 常见错误场景：
    // 1. .env 配置不正确，导致模型调用失败
    // 2. 模型没有按 XML 格式返回
    // 3. XML 标签没有闭合或嵌套错误，导致 parser.parse 失败
    // 4. 返回内容里混入解释文字，破坏了 XML 结构
    console.error("❌ 错误:", error.message);
}
