import { Injectable } from '@nestjs/common';

export type User = {
  id: string;
  email: string;
  role: 'CUSTOMER' | 'ADMIN';
};

@Injectable()
export class UsersService {
  private readonly users: User[] = [
    { id: 'user-1', email: 'customer@example.com', role: 'CUSTOMER' },
    { id: 'user-admin', email: 'admin@example.com', role: 'ADMIN' },
  ];

  async findById(id: string): Promise<User | undefined> {
    return this.users.find((user) => user.id === id);
  }
}
