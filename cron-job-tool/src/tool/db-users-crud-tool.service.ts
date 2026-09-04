import { Inject, Injectable } from '@nestjs/common';
import {
    tool,
    type StructuredToolInterface,
} from '@langchain/core/tools';
import { z } from 'zod';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
@Injectable()
export class DbUsersCrudToolService {
    readonly tool: StructuredToolInterface;
    @Inject(UsersService)
    private readonly usersService: UsersService;

    constructor() {
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

        this.tool = tool(
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
                        const created = await this.usersService.create({
                            name,
                            email,
                        });
                        return `创建用户成功，ID: ${created.id}, 姓名: ${created.name}, 邮箱: ${created.email}`;
                    }
                    case 'list': {
                        const users = await this.usersService.findAll();
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
                        const user = await this.usersService.findOne(id);
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
                        const existing = await this.usersService.findOne(id);
                        if (!existing) {
                            throw new Error(
                                `用户ID为${id}的用户不存在`,
                            );
                        }
                        await this.usersService.update(id, payload);
                        const updated = await this.usersService.findOne(id);
                        return `更新用户成功，ID: ${updated!.id}, 姓名: ${updated!.name}, 邮箱: ${updated!.email}, 更新时间=${updated!.updatedAt.toISOString()}`;
                    }
                    case 'delete': {
                        if (!id) {
                            throw new Error('delete操作需要id参数');
                        }
                        const existing = await this.usersService.findOne(id);
                        if (!existing) {
                            throw new Error(
                                `用户ID为${id}的用户不存在，无法删除`,
                            );
                        }
                        await this.usersService.remove(id);
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
    }
}