import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './ai/ai.module';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    AiModule,
    // 环境变量：优先加载仓库根目录的 .env（pnpm monorepo 约定），
    // 找不到时回退到应用目录下的 .env
    ConfigModule.forRoot({
      envFilePath: ['../.env', '.env'],
      isGlobal: true,
    }),
    // 静态资源服务：将 hello-nest-langchain/public 目录映射为 http://localhost:3000/
    // 编译产物位于 dist/，../public 即项目根目录下的 public 文件夹
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
