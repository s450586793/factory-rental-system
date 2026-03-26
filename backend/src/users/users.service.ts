import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
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

  getRepository() {
    return this.adminUsersRepository;
  }
}
