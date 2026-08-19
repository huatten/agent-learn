// 自动加载项目根目录下的 .env 文件，将环境变量注入 process.env
import 'dotenv/config'

import { RunnableSequence, RunnablePick } from '@langchain/core/runnables'

const inputData = {
    name: 'jinhua',
    age: 25,
    city: 'beijing',
    email: 'kd@example.com',
    phone: '13800000000',
    company: 'deepseek',
    position: 'software engineer',
}

const chain = RunnableSequence.from([
    (input) => ({
        ...input,
        fullInfo: `${input.name} is ${input.age} years old, ${input.city} resident.`
    }),
    new RunnablePick(['name', 'fullInfo']),
])

const result = await chain.invoke(inputData)
console.log(result)
/**
 * 测试 RunnablePick 输出结果
 * {
 *   name: 'jinhua',
 *   fullInfo: 'jinhua is 25 years old, beijing resident.'
 * }
 */