import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

// 这个文件演示的是：withStructuredOutput + stream。
//
// 这里最重要的观察点是：
// 虽然我们调用的是 structuredModel.stream(question)，
// 但 withStructuredOutput 为了保证结果符合 schema，通常会等完整结构化数据生成并校验后再返回。
//
// 如果底层使用的是 tool calls，那么模型需要先把 tool 的参数完整生成出来。
// 参数完整、格式通过之后，LangChain 才能把它转成最终的结构化对象。
//
// 所以你会看到一个很有意思的现象：
// - 代码形式上是流式 stream
// - 但实际经常只收到 1 个 chunk
// - 这个 chunk 里已经包含完整 JSON/对象
//
// 这说明：withStructuredOutput 很适合稳定拿结构化结果，
// 但不适合做“边生成边显示字段”的真正流式结构化展示。
// 真正想边接收边解析，后面还是要看 output parser 的流式能力。

// 创建一个聊天模型实例。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称。
    model: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    apiKey: process.env.OPENAI_API_KEY,

    // 结构化输出场景里建议设置为 0，让模型尽量稳定地按 schema 输出。
    temperature: 0,

    configuration: {
        // OPENAI_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 定义结构化输出的 schema。
// withStructuredOutput 会根据这份 schema 要求模型返回固定结构。
const scientistSchema = z.object({
    // 姓名，字符串。
    name: z.string().describe("姓名"),

    // 出生年份，数字。
    birth_year: z.number().describe("出生年份"),

    // 去世年份，数字。
    // 这里没有写 optional，所以模型必须返回这个字段。
    death_year: z.number().describe("去世年份"),

    // 国籍，字符串。
    nationality: z.string().describe("国籍"),

    // 职业，字符串。
    occupation: z.string().describe("职业"),

    // 著名作品列表，字符串数组。
    famous_works: z.array(z.string()).describe("著名作品列表"),

    // 简短传记，字符串。
    biography: z.string().describe("简短传记")
});

try {
    // 普通自然语言问题。
    // 这里没有手写 JSON 格式要求，因为结构约束已经交给 scientistSchema。
    const question = "请详细介绍一下达芬奇"

    // 标记当前示例：使用 withStructuredOutput 做“流式”结构化输出。
    console.log("🌊 流式结构化输出演示（withStructuredOutput）\n");

    // 使用 withStructuredOutput 方法。
    // structuredModel 是一个被包装过的模型：
    // 它的最终输出会直接变成符合 scientistSchema 的对象。
    const structuredModel = model.withStructuredOutput(scientistSchema);

    // 这里调用的是 stream，而不是 invoke。
    // 按直觉，你可能以为它会像 stream-normal.mjs 一样不断吐出多个小片段。
    // 但因为这里要等完整结构化结果通过校验，所以通常不会逐字/逐字段返回。
    const stream = await structuredModel.stream(question);

    // 记录收到的 chunk 数量。
    // 这个变量就是用来验证：withStructuredOutput 的 stream 是否真的分多次返回。
    let chunkCount = 0;

    // 保存最后得到的结构化结果。
    // 如果最后只收到 1 个 chunk，那么这个 chunk 就是完整结果。
    let result = null;

    console.log("📡 接收流式数据:\n");

    // 遍历流式结果。
    // 重点观察每个 chunk 的内容和 chunkCount。
    // 在这个示例里，你很可能看到只有一个 chunk，里面已经是完整对象。
    for await(const chunk of stream){
        chunkCount++;

        // withStructuredOutput 返回的 chunk 通常已经是结构化对象，
        // 而不是普通模型流里的字符串片段。
        result = chunk;

        // 打印每个 chunk，方便观察它是不是“完整 JSON 一次性返回”。
        console.log(`chunk ${chunkCount}:`, JSON.stringify(chunk, null, 2));
    }

    // 如果这里显示共接收 1 个数据块，就说明它不是我们平时理解的逐字流式输出。
    console.log(`\n✅ 共接收 ${chunkCount} 个数据块\n`);

    if ( result){
        // 流结束后，展示最终结构化结果。
        // 这里的 result 已经可以当普通 JavaScript 对象使用。
        console.log("📊 最终结构化结果:\n");
        console.log(JSON.stringify(result, null, 2));

        console.log("\n📝 格式化输出:");

        // 下面逐个读取字段，确认结构化对象可以直接进入业务逻辑。
        console.log(`姓名: ${result.name}`);
        console.log(`出生年份: ${result.birth_year}`);
        console.log(`去世年份: ${result.death_year}`);
        console.log(`国籍: ${result.nationality}`);
        console.log(`职业: ${result.occupation}`);
        console.log(`著名作品: ${result.famous_works.join(', ')}`);
        console.log(`传记: ${result.biography}`);
    }

}catch (error) {
    // 常见错误场景：
    // 1. .env 配置不正确，导致模型调用失败
    // 2. 当前模型或服务商对 tool calls / structured output 支持不完整
    // 3. 模型返回内容无法满足 scientistSchema 的结构或类型要求
    // 4. 误以为它会逐字流式返回，但实际等完整结构化结果后才返回
    console.error("❌ 错误:", error.message);
}
