/**
 * MCP 服务器：和风天气查询工具
 *
 * 功能：通过和风天气 API 查询城市天气
 *
 * JWT 动态生成：每次请求都会检查 JWT 是否过期，过期自动重新生成
 * 配置都从环境变量读取，使用项目ID/私钥动态生成 JWT
 *
 * 工作流程：
 * - 用户问："武汉今天天气怎么样？"
 * - AI 大模型从问题中提取出城市名 "武汉"
 * - AI 调用本工具，参数 city = "武汉"
 * - 工具内部：动态获取有效 JWT → 调用 Geo API 获取 Location ID → 再查询天气 → 返回结果
 */

// 加载环境变量（从 .env 文件读取）
// MCP 服务器作为独立进程启动，需要自己加载环境变量
import 'dotenv/config.js';
// 从官方 SDK 导入
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
// JWT 动态生成模块，使用 jose 库
import { SignJWT, importPKCS8 } from "jose";


// ========== 配置 ==========
// 从环境变量读取配置
const HF_WEATHER_API_HOST = process.env.HF_WEATHER_API_HOST;
const HF_WEATHER_APIKEY = process.env.HF_WEATHER_APIKEY;
const HF_WEATHER_PROJECT_ID = process.env.HF_WEATHER_PROJECT_ID;
const HF_WEATHER_KID = process.env.HF_WEATHER_KID;
const HF_WEATHER_PRIVITE_KEY = process.env.HF_WEATHER_PRIVITE_KEY;
// JWT 过期时间，默认 10min（600 秒）
const JWT_EXPIRE_SECONDS = parseInt(process.env.JWT_EXPIRE_SECONDS || 10 * 60, 10);


// ========== JWT 缓存 ==========
// 缓存生成的 JWT，过期自动重新生成
let cachedJwt = null;
let cachedExpiresAt = 0;

/**
 * 获取有效的 JWT Token，过期自动重新生成
 * @returns {Promise<string>} JWT token
 */
async function getValidJwt() {
    const now = Math.floor(Date.now() / 1000);

    // 如果缓存有效（提前 30 秒刷新，避免过期）直接返回
    if (cachedJwt && cachedExpiresAt > now + 30) {
        console.error('[JWT] 使用缓存的 JWT，剩余有效期：', Math.round((cachedExpiresAt - now) / 60), '分钟');
        return cachedJwt;
    }

    console.error('[JWT] JWT 已过期或未缓存，正在重新生成...');

    // 导入私钥
    const privateKey = await importPKCS8(HF_WEATHER_PRIVITE_KEY, 'EdDSA');

    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + JWT_EXPIRE_SECONDS;

    // 自定义 header，包含 kid
    const protectedHeader = {
        alg: 'EdDSA',
        kid: HF_WEATHER_KID
    };

    // payload
    const payload = {
        sub: HF_WEATHER_PROJECT_ID,
        iat: iat,
        exp: exp
    };

    // 签名生成 JWT
    const jwt = await new SignJWT(payload)
        .setProtectedHeader(protectedHeader)
        .sign(privateKey);

    // 缓存
    cachedJwt = jwt;
    cachedExpiresAt = exp;

    console.error(`[JWT] 生成成功，过期时间：${new Date(exp * 1000).toLocaleString()}`);
    return jwt;
}


// ========== 创建 MCP 服务器实例 ==========
const server = new McpServer({
    name: 'weather-mcp-server',
    version: '1.0.0'
});


// ========== 工具函数：根据城市名获取 Location ID ==========
/**
 * 调用和风天气 Geo API，根据城市名搜索获取 location ID
 * 这一步必须有，因为查询天气需要 location ID
 * @param {string} cityName - 城市名，比如 "北京"、"上海"
 * @returns {Promise<{success: boolean, location?: any, message?: string}>}
 */
async function searchCityLocation(cityName) {
    try {
        // 获取有效的 JWT
        const jwt = await getValidJwt();

        // 正确的请求路径：/geo/v2/city/lookup
        const url = `${HF_WEATHER_API_HOST}/geo/v2/city/lookup?location=${encodeURIComponent(cityName)}`;

        // JWT 认证请求头
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'X-QW-Api-Key': HF_WEATHER_APIKEY
            }
        });

        const data = await response.json();
        console.error('Geo API 响应:', JSON.stringify(data, null, 2));

        if (data.code !== '200') {
            return {
                success: false,
                message: `Geo API 返回错误码 ${data.code}: ${data.message || '未知错误'}`
            };
        }

        if (!data.location || data.location.length === 0) {
            return {
                success: false,
                message: `未找到城市 "${cityName}"，请检查城市名称是否正确`
            };
        }

        // 返回第一个匹配结果
        const first = data.location[0];
        return {
            success: true,
            location: {
                id: first.id,
                name: first.name,
                adm2: first.adm2,
                adm1: first.adm1
            }
        };
    } catch (error) {
        return {
            success: false,
            message: `网络请求失败: ${error.message}`
        };
    }
}


// ========== 工具 1：查询实时天气 ==========
server.registerTool('get_current_weather', {
    description: '查询指定城市的实时天气。你（AI）需要从用户的自然语言问题中提取出城市名称，填入参数。',
    inputSchema: z.object({
        city: z.string().describe('城市名称，由 AI 从用户问题中提取。例如用户问"武汉今天天气"，这里填"武汉"。'),
    }),
}, async ({ city }) => {
    // 检查配置
    if (!HF_WEATHER_PROJECT_ID || !HF_WEATHER_KID || !HF_WEATHER_PRIVITE_KEY || !HF_WEATHER_APIKEY || !HF_WEATHER_API_HOST) {
        return {
            content: [{
                type: 'text',
                text: '错误：环境变量未配置完整。需要配置：HF_WEATHER_PROJECT_ID, HF_WEATHER_KID, HF_WEATHER_PRIVITE_KEY, HF_WEATHER_APIKEY, HF_WEATHER_API_HOST'
            }]
        };
    }

    // 搜索城市获取 Location ID（AI 已经提取好城市名了）
    const searchResult = await searchCityLocation(city);
    if (!searchResult.success) {
        return {
            content: [{
                type: 'text',
                text: searchResult.message
            }]
        };
    }

    const location = searchResult.location;

    // 查询实时天气
    try {
        const jwt = await getValidJwt();
        const url = `${HF_WEATHER_API_HOST}/v7/weather/now?location=${location.id}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'X-QW-Api-Key': HF_WEATHER_APIKEY
            }
        });
        const data = await response.json();

        if (data.code !== '200') {
            return {
                content: [{
                    type: 'text',
                    text: `查询天气失败: 天气 API 返回错误码 ${data.code}`
                }]
            };
        }

        const now = data.now;
        const result = `📍 ${location.adm1} ${location.name} 实时天气：
📝 天气状况：${now.text}
🌡️ 温度：${now.temp}℃（体感温度：${now.feelsLike}℃）
💧 相对湿度：${now.humidity}%
💨 风向风力：${now.windDir} ${now.windScale}级
气压：${now.pressure}hPa
能见度：${now.vis}km
更新时间：${new Date(data.updateTime).toLocaleString('zh-CN')}`;

        return {
            content: [{
                type: 'text',
                text: result
            }]
        };
    } catch (error) {
        return {
            content: [{
                type: 'text',
                text: `查询天气出错: ${error.message}`
            }]
        };
    }
});


// ========== 工具 2：查询未来 7 天天气预报 ==========
server.registerTool('get_weather_forecast', {
    description: '查询指定城市未来 7 天的天气预报。你（AI）需要从用户的自然语言问题中提取出城市名称，填入参数。',
    inputSchema: z.object({
        city: z.string().describe('城市名称，由 AI 从用户问题中提取。例如用户问"北京未来一周天气"，这里填"北京"。'),
    }),
}, async ({ city }) => {
    // 检查配置
    if (!HF_WEATHER_PROJECT_ID || !HF_WEATHER_KID || !HF_WEATHER_PRIVITE_KEY || !HF_WEATHER_APIKEY || !HF_WEATHER_API_HOST) {
        return {
            content: [{
                type: 'text',
                text: '错误：环境变量未配置完整。需要配置：HF_WEATHER_PROJECT_ID, HF_WEATHER_KID, HF_WEATHER_PRIVITE_KEY, HF_WEATHER_APIKEY, HF_WEATHER_API_HOST'
            }]
        };
    }

    // 搜索城市获取 Location ID
    const searchResult = await searchCityLocation(city);
    if (!searchResult.success) {
        return {
            content: [{
                type: 'text',
                text: searchResult.message
            }]
        };
    }

    const location = searchResult.location;

    // 查询天气预报
    try {
        const jwt = await getValidJwt();
        const url = `${HF_WEATHER_API_HOST}/v7/weather/7d?location=${location.id}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'X-QW-Api-Key': HF_WEATHER_APIKEY
            }
        });
        const data = await response.json();

        if (data.code !== '200') {
            return {
                content: [{
                    type: 'text',
                    text: `查询预报失败: 天气 API 返回错误码 ${data.code}`
                }]
            };
        }

        let result = `📍 ${location.adm1} ${location.name} 未来 7 天天气预报：\n\n`;

        for (const day of data.daily) {
            const date = new Date(day.fxDate);
            const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
            result += `📅 ${day.fxDate} (${weekday})
  白天：${day.textDay}，最高温 ${day.tempMax}℃
  夜间：${day.textNight}，最低温 ${day.tempMin}℃
  风向：${day.windDirDay} ${day.windScaleDay}级
  紫外线强度：${day.uvIndex}
  相对湿度：${day.humidity}
  当天总降水量：${day.precip}毫米

`;
        }

        result += `更新时间：${new Date(data.updateTime).toLocaleString('zh-CN')}`;

        return {
            content: [{
                type: 'text',
                text: result
            }]
        };
    } catch (error) {
        return {
            content: [{
                type: 'text',
                text: `查询预报出错: ${error.message}`
            }]
        };
    }
});


// ========== 添加使用指南资源 ==========
server.registerResource('天气工具使用指南', 'docs://weather-guide', {
    description: '天气查询工具的使用说明',
    mimeType: 'text/plain'
}, async () => {
    return {
        contents: [{
            uri: 'docs://weather-guide',
            mimeType: 'text/plain',
            text: `天气查询 MCP 服务器使用指南

认证方式：JWT 动态生成（使用项目私钥自动生成）
环境变量配置：
- HF_WEATHER_PROJECT_ID=项目ID
- HF_WEATHER_KID=凭据ID
- HF_WEATHER_PRIVITE_KEY=Ed25519私钥
- HF_WEATHER_APIKEY=API Key
- HF_WEATHER_API_HOST=API网关地址

工作流程：
1. 用户问："武汉今天天气怎么样？"
2. AI 大模型从问题中提取出城市名 "武汉"
3. AI 调用工具 get_current_weather，参数 city = "武汉"
4. 工具自动调用 Geo API 获取 Location ID，再调用天气 API
5. 返回格式化天气结果

可用工具：
1. get_current_weather - 查询实时天气
   参数：city = AI 提取好的城市名称
   输出：温度、体感温度、天气状况、湿度、风力、气压、能见度

2. get_weather_forecast - 查询未来 7 天预报
   参数：city = AI 提取好的城市名称
   输出：每天的最高最低温、天气状况、风向、降水概率

数据来源：和风天气 API
官网：https://dev.qweather.com/`
        }]
    };
});


// ========== 启动服务器 ==========
const transport = new StdioServerTransport();
await server.connect(transport);

console.error('天气 MCP 服务器已启动');
