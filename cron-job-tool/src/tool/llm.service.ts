import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';

@Injectable()
export class LLMService {
    @Inject(ConfigService)
    private readonly configService: ConfigService;

    getChatModel() {
        return new ChatOpenAI({
            modelName: this.configService.get<string>('MODEL_NAME'),
            apiKey: this.configService.get<string>('OPENAI_API_KEY'),
            temperature: 0.7,
            configuration: {
                baseURL: this.configService.get<string>('OPENAI_BASE_URL'),
            },
        });
    }
}