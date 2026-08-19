import 'dotenv/config';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

// 这个文件演示的是「使用 .pipe() 串联 Runnable」。
//
// pipe 会把当前 Runnable 的输出连接到下一个 Runnable 的输入：
// 1. prompt：接收输入参数，生成格式化后的提示词
// 2. model：接收提示词，调用大模型生成 AIMessage
// 3. outputParser：接收 AIMessage，解析成结构化 JavaScript 对象
//
// 和 RunnableSequence.from([...]) 相比，连续调用 .pipe() 可以更直观地看到
// 每一个处理步骤是如何依次连接起来的。

// 创建一个聊天模型实例。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称。
    modelName: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    // 通过环境变量读取，避免将密钥直接写入代码。
    apiKey: process.env.OPENAI_API_KEY,

    // 这里设置为 0，让模型输出更加稳定。
    // 稳定的输出更适合后续进行 JSON 解析和 Schema 校验。
    temperature: 0,

    configuration: {
        // OPENAI_API_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_API_BASE_URL,
    },
});

// 使用 Zod 定义模型必须返回的数据结构。
// 解析器会根据这个 Schema 检查模型返回的字段类型和数量是否符合要求。
const outputSchema = z.object({
    // translation 必须是字符串，用来保存英文翻译结果。
    translation: z.string().describe('翻译后的英文文本'),

    // keywords 必须是一个数组，并且数组中必须正好包含 3 个字符串。
    keywords: z.array(z.string()).length(3).describe('3个关键词'),
});

// 根据 Zod Schema 创建结构化输出解析器。
//
// outputParser 主要负责两件事：
// 1. getFormatInstructions()：生成格式说明，告诉模型应该如何返回结果
// 2. invoke(response)：解析并校验模型返回的内容
const outputParser = StructuredOutputParser.fromZodSchema(outputSchema);

// 定义提示词模板。
//
// {text}：待翻译的原始文本。
// {format_instructions}：解析器生成的结构化输出格式说明。
// 这两个变量会在调用 prompt.format(input) 时被实际值替换。
const prompt = PromptTemplate.fromTemplate('将以下文本翻译成英文,然后总结为3个关键词。\n\n文本:{text}\n\n{format_instructions}');

// 使用 .pipe() 按顺序连接多个 Runnable，组装成一个 Chain。
//
// prompt.pipe(model) 的含义是：
// - 先执行 prompt，将 input 转换成格式化后的提示词
// - 再把格式化后的提示词传给 model
//
// 在此基础上继续 .pipe(outputParser)，表示：
// - 接收 model 返回的 AIMessage
// - 使用 outputParser 解析并校验模型输出
//
// 这段代码等价于：
// RunnableSequence.from([prompt, model, outputParser])
const chain = prompt.pipe(model).pipe(outputParser);

// 准备提示词模板所需的输入参数。
const input = {
    // 待翻译的原始文本。
    text: 'LangChain是一个强大的AI应用开发框架',

    // 获取解析器生成的格式说明，并将其注入提示词。
    // 这样可以引导模型按照 outputSchema 要求的结构返回结果。
    format_instructions: outputParser.getFormatInstructions(),
};

// 调用整个 Chain。
//
// chain.invoke(input) 会自动触发完整的数据流转：
// input → prompt → model → outputParser → result
//
// 最终的 result 已经是解析后的结构化对象，
// 而不是模型返回的原始文本或 AIMessage。
const result = await chain.invoke(input);

// 输出最终结果。
console.log('chain result 最终结果:', result);
