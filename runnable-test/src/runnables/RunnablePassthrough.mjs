// 自动加载项目根目录下的 .env 文件，将环境变量注入 process.env
import 'dotenv/config'

// RunnablePassthrough：原样传递输入，不做任何处理
// RunnableLambda：将普通 JavaScript 函数包装成 Runnable
// RunnableSequence：按顺序串联多个 Runnable
// RunnableMap：并行执行多个 Runnable，接收同一份输入
import {
    RunnablePassthrough,
    RunnableLambda,
    RunnableSequence,
    RunnableMap,
} from '@langchain/core/runnables'

// 这个文件演示的是「使用 RunnablePassthrough 保留原始数据」。
//
// RunnablePassthrough 的特点：
// 1. 输入是什么，输出就是什么
// 2. 不会对数据进行任何修改
// 3. 在 RunnableMap 中常与数据处理逻辑并列使用，保留原始数据供后续使用
//
// 典型的应用场景：
// - 在 Chain 中保留原始输入，方便后续调试或对比
// - 在 RunnableMap 中同时输出原始数据和处理后的数据
// - 在并行逻辑中，确保某些数据原样传递到下一个步骤

// 创建一个将输入字符串包装成对象的 Runnable。
// 输入是 'hello, langchain'，输出是 { concept: 'hello, langchain' }。
const wrapAsObject = RunnableLambda.from((input) => ({ concept: input }))

// 创建一个 RunnableMap，同时保留原始数据和处理后的数据。
//
// RunnableMap 会并行执行 internal Runnables：
// - original：直接透传，不做任何处理
// - processed：对 concept 字段进行转换处理
const parallelMap = RunnableMap.from({
    // RunnablePassthrough 会原样传递上一步收到的对象。
    // 即 { concept: 'hello, langchain' } 会原封不动地传给 original。
    original: new RunnablePassthrough(),

    // 对上一步的 concept 字段进行转换处理。
    processed: RunnableLambda.from((obj) => ({
        // 保留原始 concept 值。
        concept: obj.concept,

        // 将 concept 转换为大写。
        uppercase: obj.concept.toUpperCase(),

        // 计算 concept 的字符长度。
        length: obj.concept.length,
    })),
})

// 使用 RunnableSequence 按顺序组装 Chain。
//
// 执行流程：
// 1. wrapAsObject：将原始字符串转换成 { concept: '...' }
// 2. parallelMap：同时保留原始对象和处理后的对象
// const chain = RunnableSequence.from([wrapAsObject, parallelMap])


// 还可以简化写法
// 只保留函数、对象即可,LangChain会把函数转为 RunnableLambda,把对象转为 RunnableMap
// const chain = RunnableSequence.from([
//     (input) => ({ concept: input }),
//     {
//         original: new RunnablePassthrough(),
//         processed: RunnableLambda.from((obj) => ({
//             concept: obj.concept,
//             uppercase: obj.concept.toUpperCase(),
//             length: obj.concept.length,
//         })),
//     }
// ])


// 如果是想保留原始属性，只是扩展属性，可以使用 RunnablePassthrough.assign,就像Object.assign一样。
const chain = RunnableSequence.from([
    (input) => ({ concept: input }),
    RunnablePassthrough.assign({
        original: new RunnablePassthrough(),
        processed: RunnableLambda.from((obj) => ({
            concept: obj.concept,
            uppercase: obj.concept.toUpperCase(),
            length: obj.concept.length,
        })),
    }),
])

/**
 * 测试 RunnablePassthrough.assign 输出结果
{
  concept: 'hello, langchain',
  original: { concept: 'hello, langchain' },
  processed: {
    concept: 'hello, langchain',
    uppercase: 'HELLO, LANGCHAIN',
    length: 16
  }
}
 */



// 准备 Chain 的原始输入字符串。
const input = 'hello, langchain'

// 调用整个 Chain。
// await 会等待所有步骤按顺序执行完成。
const result = await chain.invoke(input)

// 输出最终结果。
console.log(result)

/**
 * 预期结果：
 *
 * {
 *   original: { concept: 'hello, langchain' },
 *   processed: {
 *     concept: 'hello, langchain',
 *     uppercase: 'HELLO, LANGCHAIN',
 *     length: 16
 *   }
 * }
 *
 * 其中：
 * - original 是 RunnablePassthrough 透传的原始对象
 * - processed 是经过 RunnableLambda 处理后的结果
 * - 通过 RunnableMap 的并行执行，一次调用同时得到原始数据和处理结果
 */