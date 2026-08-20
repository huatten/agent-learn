import 'dotenv/config'
import { RunnableLambda } from '@langchain/core/runnables'

// 模拟三个翻译服务，优先级从高到低
const premiumTranslator = RunnableLambda.from(async (input) => {
    console.log(`Premium翻译服务处理输入...`);
    // 模拟Premium翻译服务失败
    throw new Error('Premium translation failed')
})

const standardTranslator = RunnableLambda.from(async (input) => {
    console.log(`Standard翻译服务处理输入...`);
    // 模拟Standard翻译服务失败
    throw new Error('Standard translation timeout')
})

const localTranslator = RunnableLambda.from(async (input) => {
    console.log(`Local翻译服务处理输入...`);
    const dict = {
        'hello': '你好',
        'world': '世界',
        'agent': '智能体'
    }
    const words = input.toLowerCase().split(' ')
    return words.map(word => dict[word] || word).join(' ')
})

// withFallbacks 依次尝试三个翻译服务，直到有一个成功
const fallbackTranslator = premiumTranslator.withFallbacks({
    fallbacks: [standardTranslator, localTranslator]
})

const result = await fallbackTranslator.invoke('你好，世界！')
console.log('最终翻译结果:', result)