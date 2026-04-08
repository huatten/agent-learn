// 加载环境变量配置
// dotenv 会自动读取项目根目录下的 .env 文件，并将其中的配置注入到 process.env 中
import "dotenv/config";
// 从 @langchain/openai 包中导入 ChatOpenAI 类，这是 LangChain 对 OpenAI 聊天模型的封装
import { ChatOpenAI } from "@langchain/openai";

// 创建 ChatOpenAI 模型实例
// 这里配置了连接到大模型服务所需的参数
const model = new ChatOpenAI({
    // 使用的模型名称，从环境变量中读取
    model: process.env.MODEL_NAME,
    // API 密钥，从环境变量中读取，用于身份认证
    apiKey: process.env.OPENAI_API_KEY,
    // 当使用第三方兼容 OpenAI 接口的服务时（如智谱清言、通义千问等）需要配置此项
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL,
    },
});

const response = await model.invoke([
  {
    role: "user",
    content: "你介绍一下你自己",
  },
]);

console.log(response.content);

