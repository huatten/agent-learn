// 自动加载项目根目录下的 .env 文件，将环境变量注入 process.env
import 'dotenv/config';

// StructuredOutputParser：根据 Schema 解析和校验模型输出
import { StructuredOutputParser } from '@langchain/core/output_parsers';
// PromptTemplate：负责将输入参数填充到提示词模板中
import { PromptTemplate } from '@langchain/core/prompts';
// ChatOpenAI：用于调用兼容 OpenAI API 格式的聊天模型
import { ChatOpenAI } from '@langchain/openai';
// RunnableSequence：按照指定顺序组合多个 Runnable 步骤
import { RunnableSequence } from '@langchain/core/runnables';
// Zod：用于定义模型输出的数据结构
import { z } from 'zod';

// 这个文件演示的是「使用 RunnableSequence 组装 Chain」。
//
// 和 before.mjs 手动分步调用不同，这里把多个处理步骤组合成一个 chain：
// 1. PromptTemplate：接收输入并生成完整提示词
// 2. ChatOpenAI：调用大模型生成原始回答
// 3. StructuredOutputParser：解析并校验模型输出
//
// chain.invoke(input) 执行后，数据会按照上面的顺序自动流转，
// 最终直接得到结构化的 JavaScript 对象。

// 创建一个聊天模型实例。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称。
    modelName: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    // 通过环境变量读取，避免将密钥直接写入代码。
    apiKey: process.env.OPENAI_API_KEY,

    // 这里设置为 0，让模型输出更加稳定。
    // 稳定的输出更适合后续进行结构化解析。
    temperature: 0,

    configuration: {
        // OPENAI_API_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_API_BASE_URL,
    },
});

// 使用 Zod 定义模型必须返回的数据结构。
//
// 解析器会使用这个 Schema 对模型结果进行校验：
// - translation 必须是字符串
// - keywords 必须是包含 3 个字符串的数组
const outputSchema = z.object({
    // 保存英文翻译结果。
    translation: z.string().describe('翻译后的英文文本'),

    // 保存 3 个关键词。
    keywords: z.array(z.string()).length(3).describe('3个关键词'),
});

// 根据 Zod Schema 创建结构化输出解析器。
//
// 解析器在 Chain 中位于最后一步，负责把模型返回的文本转换成对象，
// 并检查结果是否符合 outputSchema 的定义。
const outputParser = StructuredOutputParser.fromZodSchema(outputSchema);

// 定义提示词模板。
//
// {text}：待翻译的原始文本。
// {format_instructions}：解析器生成的格式说明，用来引导模型返回指定结构。
const prompt = PromptTemplate.fromTemplate('将以下文本翻译成英文,然后总结为3个关键词。\n\n文本:{text}\n\n{format_instructions}');

// 使用 RunnableSequence 按顺序组合 Chain 的执行步骤。
//
// RunnableSequence.from([...]) 中数组的每一项都是一个 Runnable：
// - prompt 接收 input，生成格式化后的提示词
// - model 接收提示词，生成 AIMessage
// - outputParser 接收 AIMessage，生成最终的结构化对象
const chain = RunnableSequence.from([prompt, model, outputParser]);

// 准备 chain 的输入参数。
// 这些参数会首先交给 prompt，用于填充提示词模板中的变量。
const input = {
    // 待翻译的原始文本。
    text: 'LangChain 是一个强大的 AI 应用开发框架。',

    // 获取解析器生成的格式说明，并注入提示词。
    // 这样可以引导模型按照 outputSchema 要求的格式返回结果。
    format_instructions: outputParser.getFormatInstructions(),
};

// 调用整个 Chain。
//
// chain 会自动执行：PromptTemplate → ChatOpenAI → StructuredOutputParser。
// await 等待整个异步流程完成，result 就是最终解析后的结构化对象。
const result = await chain.invoke(input);

// 输出最终结果。
console.log('chain result 最终结果:', result);
