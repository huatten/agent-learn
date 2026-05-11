import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

// 这个文件演示的是：流式 tool calls 的原始返回形态。
//
// 前面 tool-call-args.mjs 里，我们用 invoke 一次性拿到了：
// response.tool_calls[0].args
// 这个 args 已经是完整的结构化对象，可以直接使用。
//
// 但如果换成 stream，情况会不一样：
// 模型不是一次性返回完整 tool_calls，
// 而是边生成边把 tool 参数片段放进 tool_call_chunks 里。
//
// 也就是说，流式过程中你会看到：
// - tool_call_chunks：工具调用参数的“碎片”
// - tool_calls：通常要等参数完整后，才能组装出完整工具调用信息
//
// 所以这个文件的重点不是“执行 tool”，而是观察并打印 tool_call_chunks 里的 args 片段。
// 这样可以实现类似流式打印的效果，但此时参数还不完整，不能直接当成最终对象使用。

// 创建一个聊天模型实例。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称。
    model: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    apiKey: process.env.OPENAI_API_KEY,

    // tool call 的参数需要稳定生成，所以这里设置为 0。
    temperature: 0,

    configuration: {
        // OPENAI_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 定义结构化输出的 schema。
// 这份 schema 会作为 tool 的参数格式，告诉模型应该填哪些字段。
const scientistSchema = z.object({
    // 科学家的全名。
    name: z.string().describe("科学家的全名"),

    // 出生年份。
    birth_year: z.number().describe("出生年份"),

    // 去世年份是可选字段。
    // 如果介绍的人还在世，模型可以不填这个字段。
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

// 把 schema 绑定成一个工具。
// 这里仍然不是为了真的执行某个本地函数，
// 而是借助 tool 参数 schema，让模型按结构生成信息。
const modelWithTool = model.bindTools([
    {
        // tool 名字，模型生成 tool call 时会引用它。
        name: 'get_scientist_info',

        // tool 描述，告诉模型这个工具用于提取科学家信息。
        description: '提取和结构化科学家的详细信息',

        // tool 参数格式，也就是模型要填的结构。
        schema: scientistSchema,
    }
])

// 标记当前示例：直接观察原始 tool_call_chunks。
console.log("🌊 流式 Tool Calls 演示 - 直接打印原始 tool_calls_chunk\n");


try {
    // 普通自然语言问题。
    // 因为模型绑定了 tool，它会倾向于把科学家信息填进 tool 参数里。
    const question = "详细介绍牛顿的生平和成就"

    // 使用 stream 发起流式调用。
    // 注意：这里不是 invoke，所以不会一开始就拿到完整 response.tool_calls。
    const stream = await modelWithTool.stream(question);

    console.log("📡 实时输出流式 tool_calls_chunk:\n");

    // 记录收到的 chunk 序号。
    // 当前代码没有打印它，但调试时可以用它观察第几个 chunk 开始出现 args。
    let chunkIndex = 0;

    // 遍历流式返回。
    // 每个 chunk 可能只包含工具参数的一小段，也可能不包含工具参数。
    for await (const chunk of stream) {
      chunkIndex ++;

      // tool_call_chunks 是流式 tool call 的关键字段。
      // 它保存的是“还在生成中的工具调用片段”。
      //
      // chunk.tool_call_chunks[0].args 通常是字符串片段，
      // 例如可能先返回 '{"name":"Isaac'，
      // 下一段再返回 ' Newton","birth_year":1643'。
      //
      // 这些片段拼起来之后，才可能成为完整 JSON 参数。
      // 所以在这里不能直接调用 tool，也不能直接当成完整 args 对象使用。
      if(chunk.tool_call_chunks  &&  chunk.tool_call_chunks.length > 0 && chunk.tool_call_chunks[0].args){
          // 直接打印 args 片段。
          // 这样用户能看到参数内容正在一点点生成，达到“流式打印”的效果。
          process.stdout.write(chunk.tool_call_chunks[0].args);
      }
    }

    // 流结束后，说明模型已经把 tool 参数片段都输出完了。
    // 但这个示例只负责展示原始片段，没有在这里把它们重新组装和解析。
    console.log("\n\n✅ 流式输出完成");
}catch (error) {
    // 常见错误场景：
    // 1. .env 配置不正确，导致模型调用失败
    // 2. 当前模型或服务商不支持 tool calls 或 tool call streaming
    // 3. 某些 chunk 不包含 tool_call_chunks，需要先判断再读取
    // 4. 误把 tool_call_chunks 当成完整 tool_calls，导致提前执行工具或读取参数失败
    console.error("❌ 错误:", error.message);
}
