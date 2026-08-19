// 自动加载项目根目录下的 .env 文件，将环境变量注入 process.env
import 'dotenv/config'

// RunnableEach：将输入数组中的每个元素分别交给同一个 Runnable 处理
// RunnableSequence：按顺序串联多个 Runnable
// RunnableLambda：将普通 JavaScript 函数包装成 Runnable
import { RunnableSequence, RunnableLambda, RunnableEach } from '@langchain/core/runnables'

// 这个文件演示的是「使用 RunnableEach 批量处理数组元素」。
//
// RunnableEach 的特点：
// 1. 接收一个数组作为输入
// 2. 取出数组中的每个元素，分别交给 bound 指定的 Runnable
// 3. 收集每个元素的处理结果，组成一个新数组返回
//
// 典型应用场景：
// - 对列表中的每一项统一格式化
// - 批量清洗或转换一批数据
// - 在一条消息中批量生成多条回复

// 创建一个将字符串转换为大写的 Runnable。
const toUpperCase = RunnableLambda.from((input) => input.toUpperCase())

// 创建一个在字符串前添加问候语的 Runnable。
const addGreeting = RunnableLambda.from((input) => `你好, ${input}`)

// 将多个步骤组合成一个处理单个元素的可执行流程：
// 1. toUpperCase：先转大写
// 2. addGreeting：再拼接问候语
const processItem = RunnableSequence.from([toUpperCase, addGreeting])

// 使用 RunnableEach 包装 processItem。
//
// channel.invoke 接收一个数组，然后对数组中的每一个元素
// 依次执行 processItem（先转大写，再拼问候语），
// 最后收集所有处理结果并返回一个新数组。
const chain = new RunnableEach({
    bound: processItem,
})

// 准备待处理的输入数组。
// 数组中的每个元素都会单独执行一遍 processItem。
const input = ['kd', 'harden', 'kwy']

// 调用 RunnableEach。
// 等价于分别对 'kd'、'harden'、'kwy' 调用 processItem，
// 再将三个结果汇总成数组。
const result = await chain.invoke(input)

// 输出输入与处理后的结果，方便对比观察。
console.log('RunnableEach-数组元素处理:')
console.log('输入:', input)
console.log('输出:', result)

/**
 * 预期结果：
 *
 * RunnableEach-数组元素处理:
 * 输入: [ 'kd', 'harden', 'kwy' ]
 * 输出: [ '你好, KD', '你好, HARDEN', '你好, KWY' ]
 *
 * 其中：
 * - 每个元素都会完整经过 toUpperCase → addGreeting 两步
 * - 结果数组的长度和输入数组一致，顺序也一一对应
 */