import 'dotenv/config';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

// 这个文件演示的是「手动完成结构化输出」的基础流程。
//
// 这里没有直接使用 model.withStructuredOutput(schema)，而是把流程拆开：
// 1. 使用 Zod 定义模型输出结构
// 2. 根据 Schema 创建 StructuredOutputParser
// 3. 将解析器生成的格式说明放进提示词
// 4. 调用模型获取原始输出
// 5. 使用解析器将模型输出转换成 JavaScript 对象
//
// 这种写法可以清楚地看到结构化输出背后的完整过程，适合学习：
// - Schema 如何描述模型输出格式
// - 格式说明如何传入 Prompt
// - 模型返回的文本如何被解析和校验

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

// 准备提示词模板所需的输入参数。
const input = {
    // 待翻译的原始文本。
    text: 'LangChain是一个强大的AI应用开发框架',

    // 获取解析器生成的格式说明，并将其注入提示词。
    // 这样可以引导模型按照 outputSchema 要求的结构返回结果。
    format_instructions: outputParser.getFormatInstructions(),
};

// 步骤 1：格式化 Prompt。
// 将 input 中的实际值填充到提示词模板，生成完整的提示词文本。
const formattedPrompt = await prompt.format(input);

// 步骤 2：调用大模型。
// 此时拿到的 response 还是模型的原始 AIMessage，不是最终的 JavaScript 对象。
const response = await model.invoke(formattedPrompt);
console.log('模型输出:', response.content);
/**
```json
    {"translation":"LangChain is a powerful AI application development framework.","keywords":["LangChain","AI","framework"]}
```
 */

// 步骤 3：解析模型输出。
//
// invoke 会读取 response 中的模型文本，将 JSON 字符串转换为 JavaScript 对象，
// 同时按照 outputSchema 校验 translation 和 keywords 是否符合定义。
//
// 解析成功后，parsedOutput 的结构如下：
// {
//     translation: '英文翻译结果',
//     keywords: ['关键词1', '关键词2', '关键词3'],
// }
const parsedOutput = await outputParser.invoke(response);

console.log('解析后的输出:', parsedOutput);
/**
解析后的输出: {
  translation: 'LangChain is a powerful AI application development framework.',
  keywords: [ 'LangChain', 'AI', 'framework' ]
}
 */
