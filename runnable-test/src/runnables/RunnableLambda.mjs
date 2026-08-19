import 'dotenv/config'

// RunnableLambda：将普通 JavaScript 函数包装成 LangChain Runnable
// RunnableSequence：按照指定顺序串联多个 Runnable
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables'

// 这个文件演示的是「使用 RunnableLambda 封装自定义函数」。
//
// RunnableLambda 适合把自己的业务逻辑接入 LangChain 流程，例如：
// - 对输入数据进行转换
// - 调用自定义工具或函数
// - 增加日志、计算或数据处理逻辑
//
// 被 RunnableLambda.from() 包装后的函数，就可以像其他 Runnable 一样：
// - 通过 invoke(input) 调用
// - 放入 RunnableSequence 中串联执行
// - 作为 Chain 的一个处理步骤

// 将“输入加 1”的普通函数包装成 Runnable。
const addOne = RunnableLambda.from((input) => {
    // 打印当前步骤收到的输入，观察数据在 Chain 中的传递过程。
    console.log(`input输入: ${input}`)

    // 当前步骤的输出会自动传给下一个 Runnable。
    return input + 1
})

// 将“输入乘以 2”的普通函数包装成 Runnable。
const multiplyByTwo = RunnableLambda.from((input) => {
    // 这里的 input 是上一个 Runnable 返回的结果，而不是最初的输入值。
    console.log(`input输入: ${input}`)

    // 返回当前步骤的计算结果。
    return input * 2
})

// 使用 RunnableSequence 按顺序组合多个 Runnable。
//
// 数组中的每个 Runnable 都会接收上一步的返回值：
// addOne → multiplyByTwo → addOne
const chain = RunnableSequence.from([addOne, multiplyByTwo, addOne])

/**
 * 调用 chain.invoke(5) 后，数据会按照以下顺序流转：
 *
 * 1. 初始输入：5
 * 2. addOne(5) = 6
 * 3. multiplyByTwo(6) = 12
 * 4. addOne(12) = 13
 *
 * 因此，Chain 的最终结果是 13。
 */

// 调用整个 Chain，并传入初始输入 5。
// await 会等待所有 Runnable 按顺序执行完成。
const result = await chain.invoke(5)

// 输出 Chain 的最终结果。
console.log(`chain结果: ${result}`)

