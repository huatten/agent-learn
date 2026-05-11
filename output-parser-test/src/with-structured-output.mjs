import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

// 这个文件演示的是 LangChain 的 withStructuredOutput API。
//
// 前面几个文件的路线大概是：
// 1. normal.mjs：自己要求模型返回 JSON，然后手动 JSON.parse
// 2. json-output-parser.mjs：用 JsonOutputParser 生成格式提示并解析
// 3. structured-output-parser*.mjs：用 schema 生成更明确的结构化提示
// 4. tool-call-args.mjs：利用 tool call 的 args 拿到结构化结果
//
// 到了 withStructuredOutput，它相当于把这些细节封装起来：
// 你只需要给它一个 schema，然后像调用普通模型一样 invoke。
// 如果底层模型支持 tool calls，LangChain 通常会优先走 tool 的方式；
// 如果不支持，再退回到 output parser 这类方式。
//
// 所以实际开发里，如果目标只是“让模型稳定返回结构化数据”，
// withStructuredOutput 往往是更省心的入口。

// 创建一个聊天模型实例。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称。
    model: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    apiKey: process.env.OPENAI_API_KEY,

    // 结构化输出场景里建议设置为 0，让模型更稳定地按 schema 输出。
    temperature: 0,

    configuration: {
        // OPENAI_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 定义结构化输出的 schema。
// 这份 schema 是本文件的核心：它告诉 withStructuredOutput 最终想要什么结构。
const scientistSchema = z.object({
    // name：科学家的全名，要求是字符串。
    name: z.string().describe("科学家的全名"),

    // birth_year：出生年份，要求是数字。
    birth_year: z.number().describe("出生年份"),

    // nationality：国籍，要求是字符串。
    nationality: z.string().describe("国籍"),

    // fields：研究领域列表，要求是字符串数组。
    fields: z.array(z.string()).describe("研究领域列表"),
});

// 这一段是 tool call 写法的对照示例。
// 在本文件真正执行的流程里，下面的 modelWithTool 没有被使用。
// 保留它可以帮助你对比：
// - 手动 bindTools：需要自己从 response.tool_calls[0].args 里取结果
// - withStructuredOutput：直接返回结构化 result，不需要自己处理 tool_calls
const modelWithTool = model.bindTools([
    {
        // tool 的名字。
        name: 'get_scientist_info',

        // tool 的说明，帮助模型判断什么时候使用这个工具。
        description: '提取和结构化科学家的详细信息',

        // tool 的参数 schema。
        schema: scientistSchema,
    }
])

// 普通自然语言问题。
// 注意这里没有手写“请返回 JSON”，因为结构要求已经由 scientistSchema 提供。
const question = "请介绍一下牛顿"
try {
    // 使用 withStructuredOutput 方法。
    //
    // 它会基于 scientistSchema 包装出一个新的模型对象 structuredModel。
    // 这个新模型的特点是：
    // - 输入仍然是自然语言问题
    // - 输出不再是普通文本 response.content
    // - 而是直接得到符合 schema 的结构化对象
    const structuredModel = model.withStructuredOutput(scientistSchema);

    // 调用结构化模型。
    // 这里返回的 result 已经是解析后的对象，不需要再 JSON.parse，
    // 也不需要自己读取 response.tool_calls[0].args。
    const result = await structuredModel.invoke(question);

    // 获取结构化结果。
    // 这里用 JSON.stringify 美化打印，方便学习时观察完整对象。
    console.log("结构化结果:", JSON.stringify(result, null, 2));

    // 下面像使用普通 JavaScript 对象一样读取字段。
    // 这也是 withStructuredOutput 最舒服的地方：
    // 调用结束后，你可以直接把 result 当成业务数据使用。
    console.log(`\n姓名: ${result.name}`);
    console.log(`出生年份: ${result.birth_year}`);
    console.log(`国籍: ${result.nationality}`);
    console.log(`研究领域: ${result.fields.join(', ')}`);
}catch (error) {
    // 常见错误场景：
    // 1. .env 配置不正确，导致模型调用失败
    // 2. 当前模型或服务商对 tool calls / structured output 支持不完整
    // 3. 模型返回内容无法满足 scientistSchema 的结构或类型要求
    // 4. 字段缺失或类型不符合预期，导致解析或校验失败
    console.error("❌ 错误:", error.message);
}
