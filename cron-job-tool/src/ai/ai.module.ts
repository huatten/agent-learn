import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { UserService } from './user.service';
import { AiController } from './ai.controller';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { MailerService } from '@nestjs-modules/mailer';
import { z } from 'zod';
import { UsersModule } from '../users/users.module';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { JobModule } from '../job/job.module';
import { JobService } from '../job/job.service';

/** 将 Date 格式化为北京时间字符串（如 2026-09-04 10:03:47），空值返回空串 */
function formatBeijingTime(date: Date | null | undefined): string {
    if (!date) {
        return '';
    }
    const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    return beijing.toISOString().replace('T', ' ').slice(0, 19);
}

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

@Module({
    imports: [UsersModule, JobModule],
    controllers: [AiController],
    providers: [
        AiService,
        UserService,
        {
            provide: 'CHAT_MODEL',
            useFactory: (configService: ConfigService) => {
                return new ChatOpenAI({
                    modelName: configService.get<string>('MODEL_NAME'),
                    apiKey: configService.get<string>('OPENAI_API_KEY'),
                    temperature: 0.7,
                    configuration: {
                        baseURL: configService.get<string>('OPENAI_BASE_URL'),
                    },
                });
            },
            inject: [ConfigService],
        },
        {
            provide: 'QUERY_USER_TOOL',
            useFactory: (userService: UserService) => {
                const queryUserArgsSchema = z.object({
                    userId: z.string().describe('用户的id，比如001'),
                });

                return tool(
                    ({ userId }: { userId: string }) => {
                        const user = userService.findOne(userId);
                        if (!user) {
                            const availableIds = userService
                                .findAll()
                                .map((u) => u.id);
                            return `用户${userId}不存在，可用用户id有：${availableIds.join(', ')}`;
                        } else {
                            return `用户信息：\n- ID: ${user.id}\n- 姓名: ${user.name}\n- 邮箱: ${user.email}\n- 角色: ${user.role}`;
                        }
                    },
                    {
                        name: 'query_user',
                        description:
                            '查询数据库中的用户信息。输入用户 ID，返回该用户的详细信息（姓名、邮箱、角色）。',
                        schema: queryUserArgsSchema,
                    },
                );
            },
            inject: [UserService],
        },
        {
            provide: 'SEND_EMAIL_TOOL',
            useFactory: (
                mailerService: MailerService,
                configService: ConfigService,
            ) => {
                const sendEmailArgsSchema = z.object({
                    to: z.email().describe('收件人邮箱'),
                    subject: z.string().describe('邮件主题'),
                    text: z.string().describe('邮件文本内容'),
                    html: z.string().describe('邮件HTML内容'),
                });
                return tool(
                    async ({
                        to,
                        subject,
                        text,
                        html,
                    }: {
                        to: string;
                        subject: string;
                        text?: string;
                        html?: string;
                    }) => {
                        const fallbackFrom =
                            configService.get<string>('MAIL_FROM');
                        await mailerService.sendMail({
                            to: to,
                            subject,
                            text: text || '暂无文本内容',
                            html: html || '暂无HTML内容',
                            from: fallbackFrom,
                        });
                        return `邮件已发送到 ${to}, 主题: ${subject}`;
                    },
                    {
                        name: 'send_email',
                        description:
                            '发送邮件。输入收件人邮箱、主题、文本内容（可选）、HTML内容（可选），返回发送结果。',
                        schema: sendEmailArgsSchema,
                    },
                );
            },
            inject: [MailerService, ConfigService],
        },
        {
            provide: 'WEB_SEARCH_TOOL',
            useFactory: (configService: ConfigService) => {
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
                return tool(
                    async ({
                        query,
                        count = 10,
                    }: {
                        query: string;
                        count?: number;
                    }) => {
                        const apiKey = configService.get<string>(
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
            },
            inject: [ConfigService],
        },
        {
            provide: 'DB_USER_CRUD_TOOL',
            useFactory: (usersService: UsersService) => {
                const dbUserCrudArgsSchema = z.object({
                    action: z
                        .enum(['create', 'list', 'get', 'update', 'delete'])
                        .describe(
                            '操作类型，比如create、list、get、update、delete',
                        ),
                    id: z
                        .number()
                        .int()
                        .positive()
                        .optional()
                        .describe('用户ID，用于get、update、delete操作'),
                    name: z
                        .string()
                        .min(1)
                        .max(50)
                        .optional()
                        .describe('用户姓名，用于create、update操作'),
                    email: z
                        .string()
                        .regex(/^[\w.-]+@[\w-]+\.[\w.-]+$/)
                        .max(50)
                        .optional()
                        .describe('用户邮箱，用于create、update操作'),
                });

                return tool(
                    async ({
                        action,
                        id,
                        name,
                        email,
                    }: {
                        action: 'create' | 'list' | 'get' | 'update' | 'delete';
                        id?: number;
                        name?: string;
                        email?: string;
                    }) => {
                        switch (action) {
                            case 'create': {
                                if (!name || !email) {
                                    throw new Error(
                                        'create操作需要name和email参数',
                                    );
                                }
                                const created = await usersService.create({
                                    name,
                                    email,
                                });
                                return `创建用户成功，ID: ${created.id}, 姓名: ${created.name}, 邮箱: ${created.email}`;
                            }
                            case 'list': {
                                const users = await usersService.findAll();
                                if (users.length === 0) {
                                    return '当前数据库中没有用户';
                                }
                                const lines = users
                                    .map(
                                        (u: User) =>
                                            `ID=${u.id}, 姓名=${u.name}, 邮箱=${u.email}`,
                                    )
                                    .join('\n');
                                return `当前数据库中用户列表：\n${lines}`;
                            }
                            case 'get': {
                                if (!id) {
                                    return 'get操作需要id参数';
                                }
                                const user = await usersService.findOne(id);
                                if (!user) {
                                    throw new Error(
                                        `用户ID为${id}的用户不存在`,
                                    );
                                }
                                return `用户信息如下：用户ID=${user.id}, 姓名=${user.name}, 邮箱=${user.email}, 创建时间=${user.createdAt.toISOString()}, 更新时间=${user.updatedAt.toISOString()}`;
                            }
                            case 'update': {
                                if (!id) {
                                    throw new Error('update操作需要id参数');
                                }
                                const payload: Partial<
                                    Pick<User, 'name' | 'email'>
                                > = {};
                                if (name !== undefined) {
                                    payload.name = name;
                                }
                                if (email !== undefined) {
                                    payload.email = email;
                                }
                                if (Object.keys(payload).length === 0) {
                                    throw new Error(
                                        'update操作需要name或email参数',
                                    );
                                }
                                const existing = await usersService.findOne(id);
                                if (!existing) {
                                    throw new Error(
                                        `用户ID为${id}的用户不存在`,
                                    );
                                }
                                await usersService.update(id, payload);
                                const updated = await usersService.findOne(id);
                                return `更新用户成功，ID: ${updated!.id}, 姓名: ${updated!.name}, 邮箱: ${updated!.email}, 更新时间=${updated!.updatedAt.toISOString()}`;
                            }
                            case 'delete': {
                                if (!id) {
                                    throw new Error('delete操作需要id参数');
                                }
                                const existing = await usersService.findOne(id);
                                if (!existing) {
                                    throw new Error(
                                        `用户ID为${id}的用户不存在，无法删除`,
                                    );
                                }
                                await usersService.remove(id);
                                return `删除用户成功，ID: ${id}, 姓名: ${existing.name}, 邮箱: ${existing.email}`;
                            }
                            default:
                                throw new Error(
                                    `未知操作类型: ${action as string}`,
                                );
                        }
                    },
                    {
                        name: 'db_user_crud',
                        description: '数据库用户CRUD工具',
                        schema: dbUserCrudArgsSchema,
                    },
                );
            },
            inject: [UsersService],
        },
        {
            provide: 'CRON_JOB_TOOL',
            useFactory: (jobService: JobService) => {
                const cronJobArgsSchema = z.object({
                    action: z.enum([
                        'add', 'list', 'toggle', 'delete'
                    ]).describe('操作类型：add新增、list列表、toggle启用禁用、delete删除'),
                    id: z.string().optional().describe('任务ID，toggle/delete操作时必填'),
                    enabled: z.boolean().optional().describe('是否启用，toggle可选，不传则默认取反'),
                    type: z.enum([
                        'cron', 'every', 'at'
                    ]).optional().describe('任务类型'),
                    instruction: z.string().optional().describe('任务指令,type=at时必填'),
                    cron: z.string().optional().describe('cron表达式,type=cron时必填'),
                    everyMs: z.number().optional().describe('every毫秒数,type=every时必填'),
                    at: z
                        .string()
                        .optional()
                        .describe(
                            'at时间,北京时间ISO字符串(如2026-09-03T09:00:00.000+08:00),type=at时必填',
                        ),
                });
                return tool(
                    async ({
                        action,
                        id,
                        enabled,
                        type,
                        instruction,
                        cron,
                        everyMs,
                        at,
                    }: {
                        action: 'add' | 'list' | 'toggle' | 'delete';
                        id?: string;
                        enabled?: boolean;
                        type?: string;
                        instruction?: string;
                        cron?: string;
                        everyMs?: number;
                        at?: Date;
                    }) => {
                        switch (action) {
                            case 'list': {
                                const jobs = await jobService.listJobs()
                                if (jobs.length === 0) {
                                    return '当前没有任务'
                                }
                                const lines = jobs
                                    .map(
                                        (job) =>
                                            `id=${job.id} type=${job.type} running=${job.running} cron=${job.cron} everyMs=${job.everyMs} at=${formatBeijingTime(job.at)} enabled=${job.isEnabled} instruction=${job.instruction}`,
                                    )
                                    .join('\n');
                                return `当前定时任务列表：\n${lines}`
                            }

                            case 'add': {
                                if (!type) {
                                    throw new Error('add操作需要type参数');
                                }
                                if (!instruction) {
                                    throw new Error('add操作需要instruction参数');
                                }
                                if (type === 'cron') {
                                    if (!cron) {
                                        return ('add操作需要cron参数');
                                    }
                                    const created = await jobService.addJob({
                                        type,
                                        instruction,
                                        cron,
                                        isEnabled: true,
                                    })
                                    return `添加任务成功，ID: ${created.id}, 指令: ${created.instruction}, cron表达式: ${created.cron}`
                                }
                                else if (type === 'every') {
                                    if (typeof everyMs !== 'number' || everyMs <= 0) {
                                        return 'everyMs参数必须是大于0的数字';
                                    }
                                    const created = await jobService.addJob({
                                        type,
                                        instruction,
                                        everyMs,
                                        isEnabled: true,
                                    })
                                    return `添加任务成功，ID: ${created.id}, 指令: ${created.instruction}, every毫秒数: ${created.everyMs}`
                                }

                                else if (type === 'at') {
                                    if (!at) {
                                        return ('add操作需要at参数');
                                    }
                                    const date = new Date(at)
                                    const created = await jobService.addJob({
                                        type,
                                        instruction,
                                        at: date,
                                        isEnabled: true,
                                    })
                                    return `添加任务成功，ID: ${created.id}, 指令: ${created.instruction}, at时间(北京时间): ${formatBeijingTime(created.at)}`
                                }
                                else {
                                    return `add操作不支持的类型: ${type}`
                                }


                            }

                            case 'toggle': {
                                if (!id) {
                                    return ('toggle操作需要id参数');
                                }
                                const updated = await jobService.toggleJob(id, enabled)
                                return `任务${id}状态已切换为${updated.isEnabled ? '启用' : '禁用'}`
                            }

                            case 'delete': {
                                if (!id) {
                                    return 'delete操作需要id参数';
                                }
                                try {
                                    const removed = await jobService.removeJob(id)
                                    return `删除任务成功，ID: ${removed.id}, 指令: ${removed.instruction}, 类型: ${removed.type}`
                                } catch (error) {
                                    return `删除任务失败：${error instanceof Error ? error.message : String(error)}`
                                }
                            }

                            default: {
                                return `不支持的操作类型: ${action as string}`;
                            }

                        }
                    },
                    {
                        name: 'cron_job',
                        description:
                            '定时任务管理工具，支持list(查看任务列表)、add(新增任务，type为cron/every/at)、toggle(启用或禁用任务)、delete(按id删除任务)。',
                        schema: cronJobArgsSchema,
                    },
                );
            },
            inject: [JobService],
        }
    ],
})
export class AiModule { }
