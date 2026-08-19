// 自动加载项目根目录下的 .env 文件，将环境变量注入 process.env
import 'dotenv/config'

// RouterRunnable：根据 key 选择要执行的 Runnable
// RunnableLambda：将普通 JavaScript 函数包装成 Runnable
import { RouterRunnable, RunnableLambda } from '@langchain/core/runnables'

// 这个文件演示的是「使用 RouterRunnable 根据 key 路由到不同 Runnable」。
//
// RouterRunnable 的执行过程是：
// 1. 通过 key 找到 runnables 配置中对应的 Runnable
// 2. 将 input 传给选中的 Runnable
// 3. 返回该 Runnable 的执行结果
//
// 它适合在多个处理逻辑中动态选择一个执行，例如：
// - 根据任务类型选择不同处理流程
// - 根据用户意图选择不同工具
// - 根据输入模式选择不同的数据转换函数

// 创建一个将字符串转换为大写的 Runnable。
const toUpperCase = RunnableLambda.from((str) => str.toUpperCase())

// 创建一个将字符串反转的 Runnable。
const reverseString = RunnableLambda.from((str) => str.split('').reverse().join(''))

// 创建 RouterRunnable，并注册可以被路由的 Runnable。
//
// runnables 对象的 key 是路由名称，调用 router.invoke 时，
// 会根据传入的 key 选择对应的 Runnable。
const router = new RouterRunnable({
    runnables: {
        // key 为 toUpperCase 时，执行 toUpperCase。
        toUpperCase,

        // key 为 reverseString 时，执行 reverseString。
        reverseString,
    },
})

// 测试调用 reverseString Runnable。
//
// key：指定要执行的 Runnable 名称。
// input：传给目标 Runnable 的实际输入。
// 这里的调用等价于 reverseString.invoke('hello')。
const result = await router.invoke({
    key: 'reverseString',
    input: 'hello',
})

// reverseString 会将 hello 反转为 olleh。
console.log('调用 reverseString Runnable 结果:', result)

// 测试调用 toUpperCase Runnable。
// 这里通过修改 key，就可以在不改变 RouterRunnable 的情况下切换处理逻辑。
const result2 = await router.invoke({
    key: 'toUpperCase',
    input: 'hello',
})

// toUpperCase 会将 hello 转换为 HELLO。
console.log('调用 toUpperCase Runnable 结果:', result2)