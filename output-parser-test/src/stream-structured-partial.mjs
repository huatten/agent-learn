import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { StructuredOutputParser } from "@langchain/core/output_parsers"
import { z } from "zod";

// 这个文件演示的是：流式输出 + Output Parser。
//
// 上一个 stream-with-structured-output.mjs 里，我们用了 withStructuredOutput.stream()。
// 但它为了保证结构化结果通过校验，往往会等完整 tool call 参数生成完才返回，
// 所以经常只看到 1 个 chunk，并不适合做真正的边生成边展示。
//
// 这里换成 Output Parser 的思路：
// 1. 先用 StructuredOutputParser 生成格式说明，放进 prompt
// 2. 用普通 model.stream(question) 让模型真正流式返回文本
// 3. 每收到一个 chunk 就立刻打印，实现“边生成边显示”
// 4. 同时把所有 chunk 拼成 fullContent
// 5. 流结束后，再用 parser.parse(fullContent) 解析成结构化对象
//
// 所以在流式场景下，Output Parser 依然很有用：
// 它不会阻止你实时显示模型输出，只是在最后帮你把完整内容解析成结构化数据。

// 创建一个聊天模型实例。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称。
    model: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    apiKey: process.env.OPENAI_API_KEY,

    // 结构化输出场景里建议设置为 0，让模型尽量稳定地按格式输出。
    temperature: 0,

    configuration: {
        // OPENAI_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 定义结构化输出的 schema。
// parser 会根据这份 schema 生成格式说明，并在最后解析完整输出。
const scientistSchema = z.object({
    // 姓名，字符串。
    name: z.string().describe("姓名"),

    // 出生年份，数字。
    birth_year: z.number().describe("出生年份"),

    // 去世年份，数字。
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

// 用 zod schema 创建 StructuredOutputParser。
// 这里 parser 的作用有两个：
// 1. getFormatInstructions()：生成格式说明，告诉模型最终要输出什么结构
// 2. parse(fullContent)：等流结束后，把完整文本解析成对象
const parser = StructuredOutputParser.fromZodSchema(scientistSchema);

// 把格式说明拼进 prompt。
// 注意：这里不是使用 withStructuredOutput，
// 而是让普通模型按 parser 的提示词生成结构化 JSON 文本。
const question = `详细介绍莫扎特的信息。\n\n${parser.getFormatInstructions()}`;

// 标记当前示例：真正流式打印，同时最后做结构化解析。
console.log("🌊 流式结构化输出演示 \n");

try {

    // 这里使用普通 model.stream(question)，而不是 structuredModel.stream(question)。
    // 这样模型会像普通流式回答一样，一块一块返回文本。
    const stream = await model.stream(question);

    // 记录收到多少个 chunk。
    // 如果这里明显大于 1，就能看到它比 withStructuredOutput.stream 更接近真正流式。
    let chunkCount = 0;

    // 保存完整输出。
    // 因为 JSON 只有完整生成后才能稳定 parse，所以必须先把所有片段收集起来。
    let fullContent = '';

    console.log("📡 接收流式数据:\n");

    // 一边接收 chunk，一边实时打印。
    // 这一步解决的是用户体验：用户不用等到最后才看到内容。
    for await(const chunk of stream){
        chunkCount++;

        // 当前 chunk 的文本内容。
        const content = chunk.content;

        // 把流式片段拼接成完整文本，供最后 parser.parse 使用。
        fullContent += content;

        // 实时打印当前片段。
        // 这就是“边生成边显示”的效果。
        process.stdout.write(content);
    }

    // 流结束后，说明完整 JSON 文本已经收集完毕。
    console.log(`\n✅ 共接收 ${chunkCount} 个数据块\n`);

    // 解析完整内容为结构化数据。
    // 注意：这里是“最后解析”，不是“每个 chunk 都解析”。
    // 因为单个 chunk 往往只是 JSON 的一小段，不一定是合法 JSON。
    const result = await parser.parse(fullContent);

    // 打印解析后的完整对象。
    console.log("📊 解析后的结构化结果:\n");
    console.log(JSON.stringify(result, null, 2));

    console.log("\n📝 格式化输出:");

    // 解析成功后，result 就是普通 JavaScript 对象，可以直接读取字段。
    console.log(`姓名: ${result.name}`);
    console.log(`出生年份: ${result.birth_year}`);
    console.log(`去世年份: ${result.death_year}`);
    console.log(`国籍: ${result.nationality}`);
    console.log(`职业: ${result.occupation}`);
    console.log(`著名作品: ${result.famous_works.join(', ')}`);
    console.log(`传记: ${result.biography}`);

}catch (error) {
    // 常见错误场景：
    // 1. .env 配置不正确，导致模型调用失败
    // 2. 当前模型或服务商不支持 stream
    // 3. 流式输出中断，fullContent 不完整
    // 4. 模型最终输出不是合法 JSON，导致 parser.parse 失败
    // 5. JSON 合法，但字段结构或类型不符合 scientistSchema
    console.error("❌ 错误:", error.message);
}
