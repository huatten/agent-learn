import {
    Injectable,
    Inject,
    Logger,
    NotFoundException,
    OnApplicationBootstrap,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { EntityManager } from 'typeorm';
import { Job } from './entities/job.entity';

@Injectable()
export class JobService implements OnApplicationBootstrap {
    private readonly logger = new Logger(JobService.name);

    @Inject(EntityManager)
    private readonly entityManager: EntityManager;

    @Inject(SchedulerRegistry)
    private readonly schedulerRegistry: SchedulerRegistry;

    async onApplicationBootstrap() {
        const enabledJobs = await this.entityManager.find(Job, {
            where: {
                isEnabled: true,
            },
        });
        const cronJobs = this.schedulerRegistry.getCronJobs();
        const intervals = this.schedulerRegistry.getIntervals();
        const timeouts = this.schedulerRegistry.getTimeouts();

        for (const job of enabledJobs) {
            const alreadyRegistered =
                (job.type === 'cron' && cronJobs.has(job.id)) ||
                (job.type === 'every' && intervals.includes(job.id)) ||
                (job.type === 'at' && timeouts.includes(job.id));
            if (alreadyRegistered) {
                continue;
            }
            this.startRunTime(job);
        }
    }

    async listJobs() {
        const jobs = await this.entityManager.find(Job, {
            order: {
                createdAt: 'DESC',
            },
        });

        const cronJobs = this.schedulerRegistry.getCronJobs();
        const intervals = this.schedulerRegistry.getIntervals();
        const timeouts = this.schedulerRegistry.getTimeouts();

        return jobs.map((job) => {
            const running =
                job.isEnabled &&
                (cronJobs.has(job.id) ||
                    intervals.includes(job.id) ||
                    timeouts.includes(job.id));

            return {
                ...job,
                running,
            };
        });
    }

    async addJob(
        input:
            | {
                  type: 'cron';
                  instruction: string;
                  cron: string;
                  isEnabled?: boolean;
              }
            | {
                  type: 'every';
                  instruction: string;
                  everyMs: number;
                  isEnabled?: boolean;
              }
            | {
                  type: 'at';
                  instruction: string;
                  at: Date;
                  isEnabled?: boolean;
              },
    ) {
        const entity = this.entityManager.create(Job, {
            instruction: input.instruction,
            type: input.type,
            cron: input.type === 'cron' ? input.cron : null,
            everyMs: input.type === 'every' ? input.everyMs : null,
            at: input.type === 'at' ? input.at : null,
            isEnabled: input.isEnabled ?? true,
            lastRun: null,
        });
        const saved = await this.entityManager.save(Job, entity);
        if (saved.isEnabled) {
            this.startRunTime(saved);
        }
        return saved;
    }

    async toggleJob(jobId: string, enabled?: boolean) {
        const job = await this.entityManager.findOne(Job, {
            where: { id: jobId },
        });
        if (!job) {
            throw new NotFoundException(`Job ${jobId} not found`);
        }
        const nextEnabled = enabled ?? !job.isEnabled;

        if (job.isEnabled !== nextEnabled) {
            job.isEnabled = nextEnabled;
            await this.entityManager.save(Job, job);
        }
        if (job.isEnabled) {
            this.startRunTime(job);
        } else {
            this.stopRunTime(job);
        }
        return job;
    }

    async removeJob(jobId: string) {
        const job = await this.entityManager.findOne(Job, {
            where: { id: jobId },
        });
        if (!job) {
            throw new NotFoundException(`Job ${jobId} not found`);
        }
        // 先从调度器移除，避免残留定时器
        this.stopRunTime(job);
        await this.entityManager.delete(Job, job.id);
        return { id: job.id, instruction: job.instruction, type: job.type };
    }

    private startRunTime(job: Job) {
        if (job.type === 'cron') {
            const cronJobs = this.schedulerRegistry.getCronJobs();
            const existing = cronJobs.get(job.id);
            if (existing) {
                existing.start();
                return;
            }
            const runtimeJob = this.createCronJob(job);
            this.schedulerRegistry.addCronJob(job.id, runtimeJob);
            runtimeJob.start();
            return;
        } else if (job.type === 'every') {
            const names = this.schedulerRegistry.getIntervals();
            if (names.includes(job.id)) {
                return;
            }
            if (typeof job.everyMs !== 'number' || job.everyMs <= 0) {
                throw new Error('everyMs must be a number greater than 0');
            }

            const ref = setInterval(() => {
                this.logger.log(
                    `Interval job ${job.id} is running, instruction: ${job.instruction}`,
                );
                void this.entityManager.update(Job, job.id, {
                    lastRun: new Date(),
                });
            }, job.everyMs);
            this.schedulerRegistry.addInterval(job.id, ref);
            return;
        } else if (job.type === 'at') {
            const names = this.schedulerRegistry.getTimeouts();
            if (names.includes(job.id)) {
                return;
            }
            if (!job.at) {
                throw new Error(`at must be a Date for job ${job.id}`);
            }

            const delay = Math.max(0, job.at.getTime() - Date.now());
            const ref = setTimeout(() => {
                this.logger.log(
                    `Timeout job ${job.id} is running, instruction: ${job.instruction}`,
                );
                void this.entityManager
                    .update(Job, job.id, {
                        lastRun: new Date(),
                        isEnabled: false,
                    })
                    .then(() => {
                        try {
                            this.schedulerRegistry.deleteTimeout(job.id);
                        } catch (error) {
                            this.logger.error(
                                `Error deleting timeout job ${job.id}: ${error}`,
                            );
                        }
                    });
            }, delay);

            this.schedulerRegistry.addTimeout(job.id, ref);
            return;
        }
    }

    private stopRunTime(job: Job) {
        if (job.type === 'cron') {
            const cronJobs = this.schedulerRegistry.getCronJobs();
            const existing = cronJobs.get(job.id);
            if (existing) {
                void existing.stop();
            }
            return;
        } else if (job.type === 'every') {
            try {
                this.schedulerRegistry.deleteInterval(job.id);
            } catch (error) {
                this.logger.error(
                    `Error deleting interval job ${job.id}: ${error}`,
                );
            }
            return;
        } else if (job.type === 'at') {
            try {
                this.schedulerRegistry.deleteTimeout(job.id);
            } catch (error) {
                this.logger.error(
                    `Error deleting timeout job ${job.id}: ${error}`,
                );
            }
            return;
        }
    }

    private createCronJob(job: Job) {
        const cronExpression = job.cron ?? '';
        return new CronJob(cronExpression, () => {
            this.logger.log(
                `Cron job ${job.id} is running, instruction: ${job.instruction}`,
            );
            void this.entityManager.update(Job, job.id, {
                lastRun: new Date(),
            });
        });
    }
}
