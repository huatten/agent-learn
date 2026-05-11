import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { StructuredOutputParser } from "@langchain/core/output_parsers";

// 这个文件演示的是 LangChain 的 StructuredOutputParser：
// 1. 先声明希望模型返回哪些字段
// 2. 每个字段都可以写一段自然语言描述
// 3. parser 会根据这些字段描述生成格式说明，并负责解析模型输出
// 可以把它理解成 JsonOutputParser 的进一步升级版：
// 不只是要求「返回 JSON」，还告诉模型「JSON 里应该有哪些字段」。

// 创建一个聊天模型实例。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称。
    model: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    apiKey: process.env.OPENAI_API_KEY,

    // 结构化输出场景里建议设置为 0，让模型尽量稳定地按格式回答。
    temperature: 0,

    configuration: {
        // OPENAI_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 定义输出结构。
// fromNamesAndDescriptions 接收一个对象：
// - key 是最终希望得到的字段名
// - value 是这个字段的说明，会被写进格式提示里告诉模型
//
// 这里的结构比普通 JsonOutputParser 更清楚，因为模型能看到每个字段的含义。
// 但它仍然主要依赖自然语言描述，不像 zod schema 那样严格校验字段类型。
const parser = StructuredOutputParser.fromNamesAndDescriptions({
    // name 字段：模型应该返回人物姓名。
    name: "姓名",

    // birth_year 字段：模型应该返回出生年份。
    // 这里描述为「出生年份」，但没有强制它一定是 number。
    birth_year: "出生年份",

    // nationality 字段：模型应该返回国籍。
    nationality: "国籍",

    // major_achievements 字段：这里明确要求用逗号分隔的字符串。
    // 注意这里不是数组，这和 normal.mjs/json-output-parser.mjs 里的 prompt 略有区别。
    major_achievements: "主要成就，用逗号分隔的字符串",

    // famous_theory 字段：模型应该返回著名理论。
    famous_theory: "著名理论"
});

// 把 parser 生成的格式说明拼进 prompt。
// 这一步很关键：如果不把 getFormatInstructions() 发给模型，
// parser 只是在本地创建了，但模型并不知道你想要什么结构。
const question = `请介绍一下爱因斯坦的信息。

${parser.getFormatInstructions()}`;

// 打印完整 prompt，方便学习时观察 StructuredOutputParser 生成了什么格式要求。
console.log('question:', question)


try {
    console.log("🤔 正在调用大模型（使用 StructuredOutputParser）...\n");

    // invoke 会把完整 question 发给模型，并等待一次性返回完整响应。
    const response = await model.invoke(question);

    console.log("📤 模型原始响应:\n");

    // 先看模型原始输出，再看 parser 解析后的对象。
    // 这样最容易理解「模型输出」和「程序可用数据」之间的转换过程。
    console.log(response.content);
    console.log("----------------------------分割线----------------------------")

    // 使用 StructuredOutputParser 解析模型输出。
    // 解析成功后，result 会变成普通 JavaScript 对象。
    // 如果模型没有按格式返回 JSON，这里仍然可能抛出错误。
    const result = await parser.parse(response.content);

    console.log("🔧 StructuredOutputParser解析后响应:\n", result);

    // 下面逐个打印字段，是为了确认 parser 得到的对象能像普通对象一样使用。
    console.log(`姓名: ${result.name}`);
    console.log(`出生年份: ${result.birth_year}`);
    console.log(`国籍: ${result.nationality}`);
    console.log(`著名理论: ${result.famous_theory}`);
    console.log(`主要成就:`, result.major_achievements);
}catch (error) {
    // 常见错误场景：
    // 1. .env 配置不正确，导致模型调用失败
    // 2. 模型没有按 StructuredOutputParser 的格式说明返回内容
    // 3. 返回内容不是合法 JSON，导致 parser.parse 失败
    // 4. 字段虽然存在，但类型或内容仍不一定完全符合你的业务预期
    console.error("❌ 错误:", error.message);
}
