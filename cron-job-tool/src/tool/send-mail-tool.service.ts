import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import {
    tool,
    type StructuredToolInterface,
} from '@langchain/core/tools';
import { z } from 'zod';

@Injectable()
export class SendMailToolService {
    readonly tool: StructuredToolInterface;
    @Inject(MailerService)
    private readonly mailerService: MailerService;
    @Inject(ConfigService)
    private readonly configService: ConfigService;

    constructor() {
        const sendEmailArgsSchema = z.object({
            to: z.email().describe('收件人邮箱'),
            subject: z.string().describe('邮件主题'),
            text: z.string().describe('邮件文本内容'),
            html: z.string().describe('邮件HTML内容'),
        });
        this.tool = tool(
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
                    this.configService.get<string>('MAIL_FROM');
                await this.mailerService.sendMail({
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
    }
}
