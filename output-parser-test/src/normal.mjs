import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";

// 这个文件演示的是「最基础」的结构化输出方式：
// 1. 在 prompt 里直接要求大模型返回 JSON
// 2. 拿到模型回复后，自己用 JSON.parse 解析
// 这种方式好理解，但也最依赖模型是否严格听话。

// 创建一个聊天模型实例。
// 这里的配置都从 .env 读取，方便以后更换模型、Key 或代理地址时不用改代码。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称，例如 gpt-4o-mini、qwen 等，具体取决于你的服务商。
    model: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    apiKey: process.env.OPENAI_API_KEY,

    // temperature 控制模型回答的随机性。
    // 结构化输出场景里通常设为 0，让模型尽量稳定、少发挥，降低 JSON 格式出错概率。
    temperature: 0,

    configuration: {
        // OPENAI_BASE_URL：自定义接口地址。
        // 如果你使用的是官方 OpenAI，可以不配置；如果是第三方兼容接口，就常常需要这个字段。
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 这里直接在问题里写清楚「请以 JSON 格式返回」以及需要哪些字段。
// 注意：这只是文字层面的约束，不是真正的 schema 校验。
// 模型仍然可能返回 Markdown 代码块、解释文字，或者字段类型不完全符合预期。
const question = "请介绍一下爱因斯坦的信息。请以 JSON 格式返回，包含以下字段：name（姓名）、birth_year（出生年份）、nationality（国籍）、major_achievements（主要成就，数组）、famous_theory（著名理论）。";

try {
    console.log("🤔 正在调用大模型...\n");

    // invoke 会把 question 发送给大模型，并等待完整回复。
    // response 是 LangChain 封装后的消息对象，真正的文本内容通常在 response.content 里。
    const response = await model.invoke(question);

    console.log("✅ 收到响应:\n");

    // 先打印原始内容，便于观察模型到底返回了什么。
    // 学习结构化输出时，这一步很重要：先看「原文」，再看「解析结果」。
    console.log(response.content);

    // 尝试把模型返回的字符串解析成 JavaScript 对象。
    // 只有当 response.content 是合法 JSON 字符串时，这一步才会成功。
    // 例如下面这种可以成功：
    // {"name":"Albert Einstein","birth_year":1879}
    //
    // 但如果模型返回：
    // ```json
    // {"name":"Albert Einstein"}
    // ```
    // 或者前后带了说明文字，JSON.parse 都会报错。
    const jsonResult = JSON.parse(response.content);

    console.log("\n📋 解析后的 JSON 对象:");

    // 解析成功后，jsonResult 就是普通对象，可以像 jsonResult.name 这样继续取字段。
    console.log(jsonResult);
}catch (error) {
    // 常见错误场景：
    // 1. .env 没有正确配置模型名、API Key 或 baseURL
    // 2. 网络/API 调用失败
    // 3. 模型返回的不是严格 JSON，导致 JSON.parse 失败
    console.error("❌ 错误:", error.message);
}
