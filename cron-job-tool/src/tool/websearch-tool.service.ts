import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    tool,
    type StructuredToolInterface,
} from '@langchain/core/tools';
import { z } from 'zod';

type WebSearchResponse = {
    code: number;
    msg?: string;
    data?: {
        webPages?: {
            value?: Array<{
                name: string;
                url: string;
                summary?: string;
                siteName?: string;
                siteIcon?: string;
                dateLastCrawled?: string;
            }>;
        };
    };
};

@Injectable()
export class WebSearchToolService {
    readonly tool: StructuredToolInterface;
    @Inject(ConfigService)
    private readonly configService: ConfigService;

    constructor() {
        const webSearchArgsSchema = z.object({
            query: z
                .string()
                .min(1)
                .describe('搜索关键词，比如公司年报、某个大事件等'),
            count: z
                .number()
                .int()
                .min(1)
                .max(20)
                .optional()
                .default(10)
                .describe('搜索结果数量，默认10条'),
        });
        this.tool = tool(
            async ({
                query,
                count = 10,
            }: {
                query: string;
                count?: number;
            }) => {
                const apiKey = this.configService.get<string>(
                    'BOCHA_WEB_SEARCH_API_KEY',
                );
                if (!apiKey) {
                    return 'BOCHA_WEB_SEARCH_API_KEY未配置，无法使用网络搜索功能';
                }
                const url = `https://api.bocha.cn/v1/web-search`;
                const body = {
                    query,
                    freshness: 'noLimit',
                    summary: true,
                    count: count ?? 10,
                };

                console.log(
                    `[web_search] 开始调用博查API, query=${query}, count=${count ?? 10}, url=${url}`,
                );
                let response: Response;
                try {
                    response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${apiKey}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(body),
                    });
                    console.log(
                        `[web_search] 请求完成, HTTP状态码=${response.status}`,
                    );
                } catch (error) {
                    console.error(
                        `[web_search] 网络请求异常: ${error}`,
                    );
                    return `搜索失败，网络请求异常：${error}`;
                }

                if (!response.ok) {
                    console.error(
                        `[web_search] 非2xx响应, 状态码=${response.status}, 错误信息=${await response.text()}`,
                    );
                    return `搜索失败，状态码：${response.status},错误信息：${await response.text()}`;
                }
                let json: WebSearchResponse;
                try {
                    json = (await response.json()) as WebSearchResponse;
                } catch (error) {
                    console.error(
                        `[web_search] 解析响应体失败: ${error}`,
                    );
                    return `搜索失败，解析响应体失败：${error}`;
                }

                try {
                    if (json.code !== 200 || !json.data) {
                        console.error(
                            `[web_search] 业务码异常, code=${json.code}, msg=${json.msg ?? '未知错误'}`,
                        );
                        return `搜索失败，错误信息：${json.msg ?? '未知错误'}`;
                    }
                    const webPages = json.data?.webPages?.value ?? [];
                    console.log(
                        `[web_search] 调用成功, code=${json.code}, 返回${webPages.length}条结果`,
                    );
                    if (webPages.length === 0) {
                        return `搜索失败，未返回任何结果`;
                    }
                    const formatted = webPages
                        .map(
                            (page, idx) => `
                          引用：${idx + 1}
                          标题: ${page.name}
                          URL: ${page.url}
                          摘要: ${page.summary}
                          网站名称: ${page.siteName}
                          网站图标: ${page.siteIcon}
                          发布时间: ${page.dateLastCrawled}
        `,
                        )
                        .join('\n\n');
                    return formatted;
                } catch (error) {
                    return `搜索失败，解析响应体失败：${error}`;
                }
            },
            {
                name: 'web_search',
                description:
                    '使用BOCHA的网络搜索功能。输入搜索查询，返回搜索结果。',
                schema: webSearchArgsSchema,
            },
        );
    }
}