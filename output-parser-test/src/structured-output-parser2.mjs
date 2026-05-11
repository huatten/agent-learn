import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { z } from'zod';

// 这个文件演示的是 StructuredOutputParser + Zod Schema：
// 1. 用 zod 明确描述字段类型，例如 string、number、array、object
// 2. 用 describe() 给每个字段写自然语言说明，让模型知道字段含义
// 3. 用 StructuredOutputParser.fromZodSchema() 根据 schema 生成 parser
//
// 可以把它理解成 structured-output-parser.mjs 的进阶版：
// 上一个文件只告诉模型「有哪些字段」，
// 这个文件进一步告诉模型「字段是什么类型、是否可选、数组里长什么样」。

// 创建一个聊天模型实例。
const model = new ChatOpenAI({
    // MODEL_NAME：要调用的模型名称。
    model: process.env.MODEL_NAME,

    // OPENAI_API_KEY：访问模型服务的密钥。
    apiKey: process.env.OPENAI_API_KEY,

    // 结构化输出场景里建议设置为 0，降低模型随意发挥导致格式错误的概率。
    temperature: 0,

    configuration: {
        // OPENAI_BASE_URL：自定义接口地址，常用于第三方 OpenAI 兼容服务。
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

// 使用 zod 定义复杂的输出结构。
// z.object({...}) 表示最终希望得到的是一个对象。
// 对象里的每个字段，都可以继续声明类型、描述、是否可选。
const scientistSchema = z.object({
    // z.string()：要求 name 是字符串。
    // describe()：给模型看的字段说明，也会进入 parser 生成的格式提示中。
    name: z.string().describe("科学家的全名"),

    // z.number()：要求 birth_year 是数字。
    // 如果模型返回字符串 "1643"，解析时可能会因为类型不匹配而失败。
    birth_year: z.number().describe("出生年份"),

    // optional() 表示这个字段可以不存在。
    // 适合「不一定有值」的信息，例如在世人物没有去世年份。
    death_year: z.number().optional().describe("去世年份，如果还在世则不填"),

    // 普通字符串字段：国籍。
    nationality: z.string().describe("国籍"),

    // z.array(z.string())：要求 fields 是字符串数组。
    // 例如 ["数学", "物理学", "天文学"]。
    fields: z.array(z.string()).describe("研究领域列表"),

    // awards 是数组，但数组里的每一项不是普通字符串，而是一个对象。
    // 这种结构适合表达「一组有多个属性的记录」。
    awards: z.array(
        z.object({
            // 每个奖项对象里必须有 name。
            name: z.string().describe("奖项名称"),

            // 每个奖项对象里必须有 year。
            year: z.number().describe("获奖年份"),

            // reason 是可选字段：模型知道就填，不确定时可以不填。
            reason: z.string().optional().describe("获奖原因")
        })
    ).describe("获得的重要奖项列表"),

    // 主要成就：字符串数组。
    // 和前面 structured-output-parser.mjs 里「逗号分隔的字符串」不同，
    // 这里明确要求它就是数组，后面才能安全地 forEach 遍历。
    major_achievements: z.array(z.string()).describe("主要成就列表"),

    // famous_theories：理论列表。
    // 每个理论都有名称、可选年份、简短描述。
    famous_theories: z.array(
        z.object({
            name: z.string().describe("理论名称"),
            year: z.number().optional().describe("提出年份"),
            description: z.string().describe("理论简要描述")
        })
    ).describe("著名理论列表"),

    // education 是一个嵌套对象，而且整个 education 字段是可选的。
    // 也就是说：模型可以返回教育背景；如果信息不足，也可以不返回这个字段。
    education: z.object({
        university: z.string().describe("主要毕业院校"),
        degree: z.string().describe("学位"),
        graduation_year: z.number().optional().describe("毕业年份")
    }).optional().describe("教育背景"),

    // 简短传记：这里用 describe 限制「100字以内」。
    // 这是给模型的自然语言要求，不是程序层面的严格字数校验。
    biography: z.string().describe("简短传记，100字以内")
});

// 从 zod schema 创建 parser。
// parser 会做两件事：
// 1. 根据 scientistSchema 生成格式说明，放进 prompt 里给模型看
// 2. 解析模型返回内容，并按 zod schema 做结构和类型检查
const parser = StructuredOutputParser.fromZodSchema(scientistSchema);

// 把 parser.getFormatInstructions() 拼进 prompt。
// 这一步很关键：schema 只是在本地定义了结构，
// 只有把格式说明发给模型，模型才知道应该按这个结构回答。
const question = `请介绍一下牛顿的详细信息，包括他的教育背景、研究领域、获得的奖项、主要成就和著名理论。
${parser.getFormatInstructions()}`;

// 打印最终提示词。
// 学习时建议重点看这里：你会看到 zod schema 被转换成了怎样的输出格式要求。
console.log('📋 生成的提示词:\n');
console.log('question', question);


try {
    console.log("🤔 正在调用大模型（使用 Zod Schema）...\n");

    // invoke 会把完整 question 发给模型，并等待完整响应。
    const response = await model.invoke(question);

    console.log("📤 模型原始响应:\n");

    // 先打印模型原始输出。
    // 这样可以对比：模型返回的是文本，parser.parse 后才变成程序可直接使用的对象。
    console.log(response.content);
    console.log("----------------------------分割线----------------------------")

    // 使用 parser 解析模型输出。
    // 如果模型返回的 JSON 结构或类型不符合 scientistSchema，这里可能会抛出错误。
    const result = await parser.parse(response.content);

    console.log("🔧 StructuredOutputParser解析后响应:\n", result);

    // 用 JSON.stringify 美化打印完整对象。
    // 适合学习时观察整体结构，尤其是数组和嵌套对象。
    console.log(JSON.stringify(result, null, 2));

    console.log("📊 格式化展示:\n");

    // 下面开始像使用普通 JavaScript 对象一样读取字段。
    // 这也是结构化输出的价值：后续业务代码不需要再从一大段文本里手动提取信息。
    console.log(`👤 姓名: ${result.name}`);
    console.log(`📅 出生年份: ${result.birth_year}`);

    // death_year 是 optional 字段，所以使用前先判断它是否存在。
    if (result.death_year) {
        console.log(`⚰️  去世年份: ${result.death_year}`);
    }

    console.log(`🌍 国籍: ${result.nationality}`);

    // fields 在 schema 里定义为字符串数组，所以这里可以直接 join。
    console.log(`🔬 研究领域: ${result.fields.join(', ')}`);

    console.log(`\n🎓 教育背景:`);

    // education 整个字段是 optional，所以也要先判断是否存在。
    if (result.education) {
        console.log(`   院校: ${result.education.university}`);
        console.log(`   学位: ${result.education.degree}`);

        // graduation_year 也是 optional，存在时再打印。
        if (result.education.graduation_year) {
            console.log(`   毕业年份: ${result.education.graduation_year}`);
        }
    }

    console.log(`\n🏆 获得的奖项 (${result.awards.length}个):`);

    // awards 在 schema 中是对象数组。
    // 所以这里每个 award 都应该包含 name、year，并且可能包含 reason。
    result.awards.forEach((award, index) => {
        console.log(`   ${index + 1}. ${award.name} (${award.year})`);

        // reason 是 optional，存在时再打印。
        if (award.reason) {
            console.log(`      原因: ${award.reason}`);
        }
    });

    console.log(`\n💡 著名理论 (${result.famous_theories.length}个):`);

    // famous_theories 也是对象数组。
    // year 是可选字段，所以这里用三元表达式决定是否显示年份。
    result.famous_theories.forEach((theory, index) => {
        console.log(`   ${index + 1}. ${theory.name}${theory.year ? ` (${theory.year})` : ''}`);
        console.log(`      ${theory.description}`);
    });

    console.log(`\n🌟 主要成就 (${result.major_achievements.length}个):`);

    // major_achievements 是字符串数组，所以可以直接遍历每个成就。
    result.major_achievements.forEach((achievement, index) => {
        console.log(`   ${index + 1}. ${achievement}`);
    });

    console.log(`\n📖 传记:`);

    // biography 是普通字符串字段。
    console.log(`   ${result.biography}`);
}catch (error) {
    // 常见错误场景：
    // 1. .env 配置不正确，导致模型调用失败
    // 2. 模型返回的不是合法 JSON
    // 3. 模型返回了 JSON，但字段类型不符合 zod schema
    // 4. 必填字段缺失，例如没有 name、birth_year、awards 等
    console.error("❌ 错误:", error.message);

    // 如果错误来自 zod 校验，这里会额外打印校验详情。
    // 不同版本的 LangChain/Zod 错误包装方式可能不同，
    // 所以这个分支主要是帮助你调试时观察更具体的问题。
    if (error.name === 'ZodError') {
        console.error("验证错误详情:", error.errors);
    }
}
