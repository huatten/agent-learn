import { Module, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './ai/ai.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { User } from './users/entities/user.entity';
import { Job } from './job/entities/job.entity';
import {
    ScheduleModule,
    CronExpression,
    SchedulerRegistry,
} from '@nestjs/schedule';
import { CronJob } from 'cron';
import { JobModule } from './job/job.module';
@Module({
    imports: [
        AiModule,
        ScheduleModule.forRoot(),
        ConfigModule.forRoot({
            envFilePath: '.env',
            isGlobal: true,
        }),
        MailerModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                transport: {
                    host: configService.get<string>('MAIL_HOST'),
                    port: configService.get<number>('MAIL_PORT'),
                    secure: configService.get<string>('MAIL_SECURE') === 'true',
                    auth: {
                        user: configService.get<string>('MAIL_USER'),
                        pass: configService.get<string>('MAIL_PASS'),
                    },
                },
                defaults: {
                    from: configService.get<string>('MAIL_FROM'),
                },
            }),
        }),
        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                type: 'mysql',
                host: configService.get<string>('DB_HOST'),
                port: configService.get<number>('DB_PORT'),
                username: configService.get<string>('DB_USER'),
                password: configService.get<string>('DB_PASS'),
                database: configService.get<string>('DB_NAME'),
                entities: [User, Job],
                synchronize: true,
                logging: true,
                connectorPackage: 'mysql2',
            }),
        }),
        UsersModule,
        JobModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule implements OnApplicationBootstrap {
    @Inject(SchedulerRegistry)
    schedulerRegistry: SchedulerRegistry;

    onApplicationBootstrap() {
        const job = new CronJob(CronExpression.EVERY_SECOND, () => {
            console.log('执行job');
        });
        this.schedulerRegistry.addCronJob('job_1', job);
        job.start();
        setTimeout(() => {
            this.schedulerRegistry.deleteCronJob('job_1');
        }, 5 * 1000);

        const intervalRef = setInterval(() => {
            console.log('执行 interval job');
        }, 1000);
        this.schedulerRegistry.addInterval('interval_1', intervalRef);
        setTimeout(() => {
            this.schedulerRegistry.deleteInterval('interval_1');
        }, 5 * 1000);

        const timeoutRef = setTimeout(() => {
            console.log('执行 timeout job');
        }, 3 * 1000);
        this.schedulerRegistry.addTimeout('timeout_1', timeoutRef);
        setTimeout(() => {
            this.schedulerRegistry.deleteTimeout('timeout_1');
        }, 5 * 1000);
    }
}
