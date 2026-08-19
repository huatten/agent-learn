// 自动加载项目根目录下的 .env 文件，将环境变量注入 process.env
import 'dotenv/config'

// RunnableMap：将多个 Runnable 组合起来，并行处理同一份输入
// RunnableLambda：将普通 JavaScript 函数包装成 Runnable
import { RunnableMap, RunnableLambda } from '@langchain/core/runnables'
// PromptTemplate：根据输入参数生成格式化后的提示词
import { PromptTemplate } from '@langchain/core/prompts'

// 这个文件演示的是「使用 RunnableMap 并行执行多个 Runnable」。
//
// RunnableMap 的特点是：
// 1. 接收同一份输入
// 2. 将输入同时传给对象中的每个 Runnable
// 3. 按照对象中的 key 收集每个 Runnable 的执行结果
//
// 因此，RunnableMap 适合把一份数据同时交给多个独立处理逻辑，
// 例如并行执行多种计算、生成多个 Prompt，或者调用多个数据处理步骤。

// 将“输入加 1”的普通函数包装成 Runnable。
// 这里从输入对象中读取 number 字段。
const addOne = RunnableLambda.from((input) => input.number + 1)

// 将“输入乘以 2”的普通函数包装成 Runnable。
const multiplyByTwo = RunnableLambda.from((input) => input.number * 2)

// 将输入对象中的 number 字段进行平方运算。
const square = RunnableLambda.from((input) => input.number * input.number)

// 创建问候语 Prompt 模板。
// 调用时会从输入对象中读取 name 字段，并替换 {name} 占位符。
const greetTemplate = PromptTemplate.fromTemplate('你好，{name}！')

// 创建天气 Prompt 模板。
// 调用时会从输入对象中读取 weather 字段，并替换 {weather} 占位符。
const weatherTemplate = PromptTemplate.fromTemplate('天气是{weather}。')

// 创建 RunnableMap，并行执行多个 Runnable。
//
// 对象中的 key 用来标识每个 Runnable 的结果，
// 最终结果会按照这些 key 组成一个新的对象。
const runnableMap = RunnableMap.from({
    // 数学运算：三个 Runnable 都会接收同一个 testInput。
    add: addOne,
    multiply: multiplyByTwo,
    square: square,

    // Prompt 格式化：根据同一个输入对象中的不同字段生成文本。
    greeting: greetTemplate,
    weather: weatherTemplate,
})

// 准备传给 RunnableMap 的统一输入。
// 这份对象会被同时传给 add、multiply、square、greeting 和 weather。
const testInput = {
    // 提供给数学运算 Runnable 使用的数字。
    number: 5,

    // 提供给 greeting PromptTemplate 使用的姓名。
    name: '张三',

    // 提供给 weather PromptTemplate 使用的天气信息。
    weather: '晴朗',
}

// 调用 RunnableMap，并传入统一输入。
//
// RunnableMap 会并行执行内部的所有 Runnable，
// result 是一个以 RunnableMap 配置项为 key 的结果对象。
const result = await runnableMap.invoke(testInput)

// 输出 RunnableMap 的最终结果。
console.log(`RunnableMap 结果`)
console.log(result)

/**
 * 预期结果：
 *
 * {
 *   add: 6,
 *   multiply: 10,
 *   square: 25,
 *   greeting: StringPromptValue {
 *     value: '你好，张三！'
 *   },
 *   weather: StringPromptValue {
 *     value: '天气是晴朗。'
 *   }
 * }
 *
 * 其中：
 * - add、multiply、square 是 RunnableLambda 返回的数字
 * - greeting、weather 是 PromptTemplate 返回的 StringPromptValue
 * - 结果对象的 key 与 RunnableMap 中配置的 key 一一对应
 */
