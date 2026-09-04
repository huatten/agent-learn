import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
    tool,
    type StructuredToolInterface,
} from '@langchain/core/tools';
import { z } from 'zod';
import { JobService } from '../job/job.service';

@Injectable()
export class CronJobToolService {
    readonly tool: StructuredToolInterface;

    constructor(private readonly moduleRef: ModuleRef) {
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
        this.tool = tool(
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
                        const jobs = await this.jobService.listJobs()
                        if (jobs.length === 0) {
                            return '当前没有任务'
                        }
                        const lines = jobs
                            .map(
                                (job) =>
                                    `id=${job.id} type=${job.type} running=${job.running} cron=${job.cron} everyMs=${job.everyMs} at=${job.at?.toISOString()} enabled=${job.isEnabled} instruction=${job.instruction}`,
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
                            const created = await this.jobService.addJob({
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
                            const created = await this.jobService.addJob({
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
                            const created = await this.jobService.addJob({
                                type,
                                instruction,
                                at: date,
                                isEnabled: true,
                            })
                            return `添加任务成功，ID: ${created.id}, 指令: ${created.instruction}, at时间(北京时间): ${created.at?.toISOString()}`
                        }
                        else {
                            return `add操作不支持的类型: ${type}`
                        }


                    }

                    case 'toggle': {
                        if (!id) {
                            return ('toggle操作需要id参数');
                        }
                        const updated = await this.jobService.toggleJob(id, enabled)
                        return `任务${id}状态已切换为${updated.isEnabled ? '启用' : '禁用'}`
                    }

                    case 'delete': {
                        if (!id) {
                            return 'delete操作需要id参数';
                        }
                        try {
                            const removed = await this.jobService.removeJob(id)
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
    }

    // JobService 通过 ModuleRef 惰性获取：
    // CronJobToolService -> JobService -> JobAgentService -> CRON_JOB_TOOL(即本服务的 tool)
    // 构成构造期循环依赖，直接注入会让 CRON_JOB_TOOL 在 JobAgentService 构造时解析为 undefined。
    // 该工具只在运行时(回调内)才真正用到 JobService，故改为按需解析，打破构造期的环。
    private get jobService(): JobService {
        return this.moduleRef.get(JobService, { strict: false });
    }
}