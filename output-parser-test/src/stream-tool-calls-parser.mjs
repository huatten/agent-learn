import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { JsonOutputToolsParser } from "@langchain/core/output_parsers/openai_tools"
import { z } from "zod";

// 这个文件演示的是：流式 tool calls + JsonOutputToolsParser。
//
// 上一个 stream-tool-calls-raw.mjs 里，我们直接打印了 tool_call_chunks[0].args。
// 那种方式能看到参数碎片正在流式生成，但它只是字符串片段：
// - 可能不是完整 JSON
// - 不能直接当成完整对象使用
// - 也还没有完整的 tool_calls 信息
//
// 如果我们希望“参数还没完全生成完，也尽量拿到当前已经成形的 JSON 对象”，
// 就可以使用 JsonOutputToolsParser。
//
// 它的作用可以理解成：
// 1. 接收模型流式返回的 tool_call_chunks
// 2. 帮我们把参数碎片不断拼接
// 3. 尝试解析成符合 JSON 格式的 tool call 对象
// 4. 在流还没结束时，也尽量输出当前已经解析出来的 args
//
// 这说明 output parser 仍然有价值：
// - 做真正的流式打印/流式解析时需要它
// - 处理 XML、YAML 等非 JSON 格式时也需要它
//
// 小提醒：流式阶段拿到的 args 可能是“部分参数”。
// 如果只是用于 UI 预览、进度展示、提前填表，很合适；
// 如果要真的执行有副作用的工具，最好等必要字段都齐了再调用。

// 创建一个聊天模型实例。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称。
    model: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    apiKey: process.env.OPENAI_API_KEY,

    // tool 参数生成需要稳定性，所以这里设置为 0。
    temperature: 0,

    configuration: {
        // OPENAI_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 定义结构化输出的 schema。
// 这份 schema 会作为 tool 的参数格式，告诉模型应该生成哪些字段。
const scientistSchema = z.object({
    // 科学家的全名。
    name: z.string().describe("科学家的全名"),

    // 出生年份。
    birth_year: z.number().describe("出生年份"),

    // 去世年份是可选字段。
    // 如果介绍的人还在世，模型可以不填。
    death_year: z.number().optional().describe("去世年份，如果还在世则不填"),

    // 国籍。
    nationality: z.string().describe("国籍"),

    // 研究领域列表。
    fields: z.array(z.string()).describe("研究领域列表"),

    // 主要成就列表。
    achievements: z.array(z.string()).describe("主要成就"),

    // 简短传记。
    biography: z.string().describe("简短传记")
});

// 把 schema 绑定成 tool。
// 绑定后，模型会把科学家信息放进 get_scientist_info 的参数里生成。
const modelWithTool = model.bindTools([
    {
        // tool 名称。
        name: 'get_scientist_info',

        // tool 描述，帮助模型判断这个工具的用途。
        description: '提取和结构化科学家的详细信息',

        // tool 参数格式。
        schema: scientistSchema,
    }
])


// 1. 创建 JsonOutputToolsParser。
// 它专门用于解析 OpenAI tool calls 的输出，
// 尤其适合处理 stream 场景下不断出现的 tool_call_chunks。
const parser = new JsonOutputToolsParser();

// 把“绑定了 tool 的模型”和“tool 输出解析器”串起来。
// pipe(parser) 的意思是：
// 模型先产生 tool call 流式结果，再交给 parser 做增量解析。
const chain = modelWithTool.pipe( parser)

try {
    // 2. 开启流式调用。
    // 问题本身仍然是普通自然语言；
    // 结构化要求来自前面绑定的 tool schema。
    const question = "详细介绍牛顿的生平和成就"

    // 这里对 chain 调用 stream，而不是直接对 modelWithTool 调用 stream。
    // 区别是：
    // - modelWithTool.stream(question)：拿到原始 tool_call_chunks
    // - chain.stream(question)：拿到 parser 尝试解析后的 tool call 对象
    const stream = await chain.stream(question);

    console.log("📡 实时输出流式内容:\n");

    // 遍历 parser 处理后的流式结果。
    // chunk 通常是一个数组，因为一次响应里可能包含多个 tool call。
    for await (const chunk of stream) {
        // 有解析结果时再读取。
        // 流式早期可能还没有足够内容形成可解析对象，所以要先判断长度。
        if (chunk.length > 0){
            // 这里先取第一个 tool call。
            // 本例只绑定并期望使用一个工具：get_scientist_info。
            const toolCall = chunk[0];

            // toolCall.args 是 JsonOutputToolsParser 根据 tool_call_chunks 拼出来的参数对象。
            // 它可能会随着流式返回逐步变完整：
            // 一开始可能只有 name，
            // 后面逐渐出现 birth_year、nationality、achievements 等字段。
            //
            // 这就是它比直接打印原始 args 字符串更方便的地方：
            // 我们拿到的是对象，而不是不完整的 JSON 字符串片段。
            console.log(toolCall.args);
        }
    }

    // 流结束后，说明 tool 参数已经完整生成并解析完毕。
    console.log("\n\n✅ 流式输出完成");
}catch (error) {
    // 常见错误场景：
    // 1. .env 配置不正确，导致模型调用失败
    // 2. 当前模型或服务商不支持 tool calls / tool call streaming
    // 3. tool_call_chunks 里的内容暂时无法解析成对象
    // 4. 流式阶段拿到的是部分 args，业务代码却按完整参数处理
    console.error("❌ 错误:", error.message);
}
