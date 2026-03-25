import { Column, Entity } from "typeorm";
import { BaseEntityWithTimestamps } from "../common/database/base.entity";

@Entity("admin_users")
export class AdminUser extends BaseEntityWithTimestamps {
  @Column({ unique: true })
  username!: string;

  @Column()
  passwordHash!: string;
}
