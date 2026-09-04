import { Injectable } from '@nestjs/common';
import { tool, type StructuredToolInterface } from '@langchain/core/tools';

@Injectable()
export class TimeNowToolService {
    readonly tool: StructuredToolInterface;
    constructor() {
        this.tool = tool(
            () => {
                const now = new Date()
                return `当前服务器时间：ISO=${now.toISOString()}，时间戳=${now.getTime()}`
            }, {
            name: 'time_now',
            description: '获取当前服务器的时间，返回ISO格式的时间和时间戳格式',
        },
        );
    }
}
