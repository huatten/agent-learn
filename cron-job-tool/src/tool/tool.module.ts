import { Module, forwardRef } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { JobModule } from '../job/job.module';
import { LLMService } from './llm.service';
import { WebSearchToolService } from './websearch-tool.service';
import { DbUsersCrudToolService } from './db-users-crud-tool.service';
import { SendMailToolService } from './send-mail-tool.service';
import { CronJobToolService } from './cron-job-tool.service';
import { TimeNowToolService } from './time-now-tool.service';


@Module({
    imports: [UsersModule, forwardRef(() => JobModule)],
    providers: [LLMService, WebSearchToolService, DbUsersCrudToolService, SendMailToolService, CronJobToolService, TimeNowToolService,
        {
            provide: 'CHAT_MODEL',
            useFactory: (service: LLMService) => service.getChatModel(),
            inject: [LLMService],
        },
        {
            provide: 'WEB_SEARCH_TOOL',
            useFactory: (service: WebSearchToolService) => service.tool,
            inject: [WebSearchToolService],
        },
        {
            provide: 'DB_USERS_CRUD_TOOL',
            useFactory: (service: DbUsersCrudToolService) => service.tool,
            inject: [DbUsersCrudToolService],
        },
        {
            provide: 'SEND_EMAIL_TOOL',
            useFactory: (service: SendMailToolService) => service.tool,
            inject: [SendMailToolService],
        },
        {
            provide: 'CRON_JOB_TOOL',
            useFactory: (service: CronJobToolService) => service.tool,
            inject: [CronJobToolService],
        },
        {
            provide: 'TIME_NOW_TOOL',
            useFactory: (service: TimeNowToolService) => service.tool,
            inject: [TimeNowToolService],
        },
    ],
    exports: ['CHAT_MODEL', 'WEB_SEARCH_TOOL', 'DB_USERS_CRUD_TOOL', 'SEND_EMAIL_TOOL', 'CRON_JOB_TOOL', 'TIME_NOW_TOOL'],
})
export class ToolModule { }
