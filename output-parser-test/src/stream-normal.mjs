import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";

// 这个文件演示的是「普通流式输出」。
//
// 前面的 withStructuredOutput 更适合一次性拿到完整结构化对象。
// 但有些场景需要边生成边展示，例如：
// - 聊天页面里逐字显示回答
// - 长文本生成时先让用户看到进度
// - 一边接收模型输出，一边收集完整内容，最后再解析
//
// 所以这里先不做结构化，只观察最基础的 stream 流程：
// 1. model.stream(question) 发起流式调用
// 2. for await...of 逐块接收模型返回
// 3. process.stdout.write 实时打印
// 4. fullContent 保存完整内容，方便后续统一处理

// 创建一个聊天模型实例。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称。
    model: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    apiKey: process.env.OPENAI_API_KEY,

    // 这里设置为 0，让模型回答更稳定。
    // 即使是普通文本输出，也方便学习时多次运行对比结果。
    temperature: 0,

    configuration: {
        // OPENAI_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 这里先问一个普通问题，不要求 JSON，也不绑定 schema。
// 目的就是单纯观察流式文本是怎么一块一块返回的。
const question = "请详细介绍一下牛顿的信息。";

// 标记当前示例：普通流式输出，不做结构化解析。
console.log("🌊 普通流式输出演示（无结构化）\n");

try {
    console.log("🤔 正在调用大模型...\n");

    // stream 和 invoke 的区别：
    // - invoke：等模型完整生成完，再一次性返回结果
    // - stream：模型边生成边返回，每次返回一个 chunk
    const stream = await model.stream(question);

    // fullContent 用来把所有 chunk 拼回完整文本。
    // 虽然我们会实时打印，但很多时候最后仍然需要完整内容做存档或解析。
    let fullContent = '';

    // chunkCount 用来记录一共收到了多少个数据块。
    // 学习流式输出时，它可以帮助你直观看到模型不是一次性返回的。
    let chunkCount = 0;

    console.log("📡 接收流式数据:\n");

    // for await...of 用来遍历异步流。
    // 每次循环拿到的 chunk，都是模型当前刚生成的一小段内容。
    for await (const chunk of stream) {
        chunkCount++;

        // chunk.content 是当前数据块里的文本内容。
        // 有些模型或服务商可能会返回空字符串，所以真实项目里可以按需做保护判断。
        const content = chunk.content;

        // 把当前 chunk 追加到完整内容里。
        fullContent += content;

        // 实时显示流式文本。
        // 这里用 process.stdout.write，而不是 console.log，
        // 是因为 console.log 每次都会换行，不适合模拟聊天应用里的逐字输出效果。
        process.stdout.write(content);
    }

    // 流结束后，说明模型已经完整回答完毕。
    console.log(`\n\n✅ 共接收 ${chunkCount} 个数据块\n`);

    // 打印完整内容长度，确认 fullContent 已经收集到了所有流式片段。
    console.log(`📝 完整内容长度: ${fullContent.length} 字符`);
}catch (error) {
    // 常见错误场景：
    // 1. .env 配置不正确，导致模型调用失败
    // 2. 当前模型或服务商不支持 stream
    // 3. 网络中断，导致流式响应没有正常结束
    console.error("❌ 错误:", error.message);
}
