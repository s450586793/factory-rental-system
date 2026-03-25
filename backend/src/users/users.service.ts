import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { Repository } from "typeorm";
import { AdminUser } from "./admin-user.entity";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(AdminUser)
    private readonly adminUsersRepository: Repository<AdminUser>,
  ) {}

  findByUsername(username: string) {
    return this.adminUsersRepository.findOne({ where: { username } });
  }

  async ensureAdminUser(username: string, password: string) {
    const existing = await this.findByUsername(username);
    const passwordHash = await bcrypt.hash(password, 10);

    if (existing) {
      existing.passwordHash = passwordHash;
      return this.adminUsersRepository.save(existing);
    }

    const user = this.adminUsersRepository.create({
      username,
      passwordHash,
    });
    return this.adminUsersRepository.save(user);
  }
}
