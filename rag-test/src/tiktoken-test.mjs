// ========== 【tiktoken 分词示例】 ==========
// tiktoken 是 OpenAI 开源的快速分词库
// 🤔 什么是分词？
// 大模型不能直接读懂文字，它只能处理 token（令牌）
// 我们需要把文字切分成一个个 token，每个 token 对应一个整数 id，才能输入给模型
//
// 📌 为什么需要分词？
//  1. 控制输入长度：每个模型都有最大 token 限制（比如 gpt-3.5 是 4k/16k，gpt-4 是 8k/128k）
//  2. 计算费用：OpenAI 等服务商按 token 数量收费，需要提前计算多少 token 算多少钱
//  3. 模型输入要求：模型只接受 token id 序列，不接受原始字符串

// 从 js-tiktoken 包导入方法
// js-tiktoken 是 tiktoken 的 JavaScript 实现，适合在 Node.js 环境使用
import { getEncodingNameForModel, getEncoding } from "js-tiktoken";

// ========== 1. 根据模型名称获取分词编码名称 ==========
// 不同模型可能使用不同的分词编码
// gpt-4, gpt-3.5-turbo, text-ada-001 等都用 cl100k_base 编码
const modelName = "gpt-4";
const encodingName = getEncodingNameForModel(modelName);
console.log(`模型 "${modelName}" 使用的分词编码:`, encodingName);  // 输出: cl100k_base

// 🔍 在线可视化工具：https://tiktoken.aigc2d.com/
// 可以打开这个网站测试任意文字会被分成多少 token

// ========== 2. 获取分词编码器 ==========
// 根据编码名称得到编码器实例，可以用来分词
const enc = getEncoding(encodingName);

// ========== 3. 测试分词效果 ==========
// 测试不同单词的分词结果，观察 token 数量

// 英文单词 "apple" → 1 个 token
// apple 是 OpenAI 词表中已有的完整单词，直接作为一个 token
console.log('apple → tokens:', enc.encode('apple'), 'token 数量:', enc.encode('apple').length);
// 实际结果：apple → tokens: [ 23182 ] token 数量: 1

// 英文单词 "pineapple" → 2 个 token
// pineapple 不在词表中作为完整单词，被拆分为 pine + apple 两个 token
console.log('pineapple → tokens:', enc.encode('pineapple'), 'token 数量:', enc.encode('pineapple').length);
// 实际结果：pineapple → tokens: [ 39138, 23182 ] token 数量: 2

// 中文 "苹果" → 3 个 token
// 注意：中文每个字**不一定**都是一个 token
// "苹" + "果" + 一个特殊 token？不，实际分词结果就是 3 个 token
// 因为 BPE 分词算法会根据词频合并，中文通常每个字约 1-2 个 token
console.log('苹果 → tokens:', enc.encode('苹果'), 'token 数量:', enc.encode('苹果').length);
// 实际结果：苹果 → tokens: [ 51043, 117, 28873 ] token 数量: 3

// 中文 "吃饭" → 5 个 token
// 两个汉字分成了 5 个 token，说明有些汉字在词表中频率低，会被切分成更小的字节片段
console.log('吃饭 → tokens:', enc.encode('吃饭'), 'token 数量:', enc.encode('吃饭').length);
// 实际结果：吃饭 → tokens: [ 7305, 225, 165, 98, 255 ] token 数量: 5

// 中文 "一二三" → 3 个 token
// 三个数字汉字正好分成 3 个 token
console.log('一二三 → tokens:', enc.encode('一二三'), 'token 数量:', enc.encode('一二三').length);
// 实际结果：一二三 → tokens: [ 15120, 41920, 46091 ] token 数量: 3

// 💡 实战总结：
//  - 常见英文单词 ≈ 1 个 token
//  - 不常见/更长英文会被拆分，每个 token ≈ 4-5 个字母
//  - 中文平均 ≈ 1.3 ~ 2 个 token 每个汉字（取决于频率）
//  - 估算：`1000 token ≈ 500 ~ 700 个汉字 ≈ 一页 A4 纸文字`
//  - BPE 分词算法：词频高的会保留完整词，词频低的会拆分成更小的字节片段
