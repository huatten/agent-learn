// 自动加载项目根目录下的 .env 文件，将环境变量注入 process.env
import 'dotenv/config'

// RunnableBranch：根据条件选择要执行的 Runnable
// RunnableLambda：将普通 JavaScript 函数包装成 Runnable
import { RunnableBranch, RunnableLambda } from '@langchain/core/runnables'

// 这个文件演示的是「使用 RunnableBranch 根据条件执行不同逻辑」。
//
// RunnableBranch 的基本结构是：
// [条件 Runnable, 处理 Runnable]
//
// 执行时，RunnableBranch 会按照配置顺序依次判断条件：
// 1. 如果某个条件返回 true，就执行对应的处理 Runnable
// 2. 后面的条件不会继续判断
// 3. 如果所有条件都返回 false，就执行最后配置的默认 Runnable
//
// 因此，分支条件的顺序非常重要。多个条件同时满足时，排在前面的条件优先。

// 创建“输入是否为正数”的条件 Runnable。
// 条件满足时返回 true，否则返回 false。
const isPositive = RunnableLambda.from((num) => num > 0)

// 创建“输入是否为负数”的条件 Runnable。
const isNegative = RunnableLambda.from((num) => num < 0)

// 创建“输入是否为偶数”的条件 Runnable。
const isEven = RunnableLambda.from((num) => num % 2 === 0)

// 创建满足“正数”条件时的处理 Runnable。
const handlePositive = RunnableLambda.from((num) => `正数：${num} + 10 = ${num + 10}`)

// 创建满足“负数”条件时的处理 Runnable。
const handleNegative = RunnableLambda.from((num) => `负数：${num} - 10 = ${num - 10}`)

// 创建满足“偶数”条件时的处理 Runnable。
const handleEven = RunnableLambda.from((num) => `偶数：${num} * 2 = ${num * 2}`)

// 创建默认处理 Runnable。
// 当所有条件都不满足时，RunnableBranch 会执行这个 Runnable。
const handleDefault = RunnableLambda.from((num) => `默认：${num}`)

// 创建 RunnableBranch，并配置条件与处理逻辑。
//
// RunnableBranch 会按照下面的顺序判断：
// 1. 正数 → handlePositive
// 2. 负数 → handleNegative
// 3. 偶数 → handleEven
// 4. 以上都不满足 → handleDefault
//
// 注意：4 同时满足“正数”和“偶数”，由于 isPositive 排在 isEven 前面，
// 所以 4 会执行 handlePositive，而不会执行 handleEven。
const branch = RunnableBranch.from([
    [isPositive, handlePositive],
    [isNegative, handleNegative],
    [isEven, handleEven],
    handleDefault,
])

// 准备多个测试输入，观察不同条件对应的分支结果。
const testCase = [5, -3, 4, 0]

// 依次调用 RunnableBranch。
// 每次循环都会把当前数字传入 branch，等待匹配的分支执行完成。
for (const num of testCase) {
    const result = await branch.invoke(num)
    console.log(`输入：${num} => ${result}`)
}

/**
输入：5 => 正数：5 + 10 = 15
输入：-3 => 负数：-3 - 10 = -13
输入：4 => 正数：4 + 10 = 14
输入：0 => 偶数：0 * 2 = 0
 */