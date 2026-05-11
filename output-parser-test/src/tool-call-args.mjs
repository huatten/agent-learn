import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

// 这个文件演示的是：通过 tool call 的参数获取结构化结果。
//
// 前面的 StructuredOutputParser 是这样做的：
// 1. 根据 schema 生成一大段格式提示词
// 2. 让模型按提示词返回 JSON
// 3. 再由 parser 解析 JSON
//
// 而 tool call 的思路不太一样：
// 1. 我们把 schema 声明成一个 tool 的参数格式
// 2. 模型不是直接返回普通文本，而是选择调用这个 tool
// 3. 模型要填入 tool 的参数，这些参数本身就是结构化对象
//
// 所以这里重点观察 response.tool_calls：
// 结构化数据不在 response.content 里，而在 tool_calls[0].args 里。

// 创建一个聊天模型实例。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称。
    model: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    apiKey: process.env.OPENAI_API_KEY,

    // 结构化输出场景里建议设置为 0，让模型更稳定地按 tool 参数格式填值。
    temperature: 0,

    configuration: {
        // OPENAI_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 定义结构化输出的 schema。
// 这份 schema 后面会被绑定到 tool 上，变成 tool 的参数格式。
// 也就是说：模型如果调用这个 tool，就必须按这些字段组织参数。
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

// bindTools 会把一个或多个工具绑定到模型上。
// 绑定以后，模型在回答时可以选择“调用工具”，并按工具 schema 填入参数。
//
// 这里的工具并不是真的去执行一个本地函数。
// 我们主要借用 tool 的参数 schema，让模型把信息填进 args 里。
const modelWithTool = model.bindTools([
    {
        // tool 的名字，模型会在 tool_calls 里记录它调用了哪个工具。
        name: 'get_scientist_info',

        // tool 的说明，告诉模型这个工具适合用来做什么。
        description: '提取和结构化科学家的详细信息',

        // tool 的参数格式。
        // 这就是本例的关键：用 zod schema 约束模型应该填哪些参数。
        schema: scientistSchema,
    }
])

// 普通自然语言问题。
// 这里没有手写“请按 JSON 返回”，因为结构要求已经放在 tool schema 里了。
const question = "请介绍一下牛顿"
try {
    // 调用绑定了 tool 的模型。
    // 如果模型判断应该使用 get_scientist_info，就会在响应里生成 tool_calls。
    const response = await modelWithTool.invoke(question);

    // 打印 tool_calls，重点观察它的结构。
    // 通常可以看到类似：
    // [
    //   {
    //     name: "get_scientist_info",
    //     args: { name: "...", birth_year: ..., fields: [...] }
    //   }
    // ]
    console.log('response.tool_calls:',response.tool_calls)

    // 获取结构化结果。
    // tool_calls[0] 表示模型调用的第一个工具。
    // args 就是模型按 scientistSchema 填好的参数对象。
    //
    // 这也是 tool call 做结构化输出时最核心的一行：
    // 不需要从 response.content 里 parse JSON，而是直接读取 tool call 的 args。
    const result = response.tool_calls[0].args;

    console.log("----------------------------分割线----------------------------")

    // 美化打印完整结构化对象，方便学习时观察字段和类型。
    console.log("结构化结果:", JSON.stringify(result, null, 2));

    // 下面像使用普通 JavaScript 对象一样读取字段。
    // 如果 tool call 成功，result.name、result.fields 等字段就可以直接用于后续业务逻辑。
    console.log(`\n姓名: ${result.name}`);
    console.log(`出生年份: ${result.birth_year}`);
    console.log(`国籍: ${result.nationality}`);
    console.log(`研究领域: ${result.fields.join(', ')}`);
}catch (error) {
    // 常见错误场景：
    // 1. .env 配置不正确，导致模型调用失败
    // 2. 当前模型或服务商不支持 tool calling
    // 3. 模型没有生成 tool_calls，导致 response.tool_calls[0] 取不到
    // 4. tool args 的字段不符合预期，需要检查 schema 和模型返回内容
    console.error("❌ 错误:", error.message);
}
