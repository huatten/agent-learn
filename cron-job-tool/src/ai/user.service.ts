import { Injectable } from '@nestjs/common';

type User = {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
};

@Injectable()
export class UserService {
    private readonly users = new Map<string, User>([
        [
            '001',
            {
                id: '001',
                name: '张三',
                email: 'zhangsan@example.com',
                phone: '13800000000',
                role: 'admin',
            },
        ],
        [
            '002',
            {
                id: '002',
                name: '李四',
                email: 'lisi@example.com',
                phone: '13800000001',
                role: 'user',
            },
        ],
    ]);

    findAll(): User[] {
        return Array.from(this.users.values());
    }

    findOne(id: string): User | undefined {
        return this.users.get(id);
    }

    createUser(user: User): User {
        this.users.set(user.id, user);
        return user;
    }

    updateUser(id: string, partial: Partial<Omit<User, 'id'>>): User | undefined {
        const existing = this.users.get(id);
        if (!existing) {
            return undefined;
        }

        const updated: User = {
            ...existing,
            ...partial,
            id: existing.id,
        };
        this.users.set(id, updated);
        return updated;
    }

    deleteUser(id: string): boolean {
        return this.users.delete(id);
    }
}
