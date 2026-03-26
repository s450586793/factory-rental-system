import * as bcrypt from "bcrypt";
import { Repository } from "typeorm";
import { AdminUser } from "../../users/admin-user.entity";

export async function ensureAdminUserExists(
  repository: Repository<AdminUser>,
  username: string,
  password: string,
) {
  const existing = await repository.findOne({ where: { username } });
  if (existing) {
    return existing;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = repository.create({
    username,
    passwordHash,
  });
  return repository.save(user);
}

export async function upsertAdminUser(
  repository: Repository<AdminUser>,
  username: string,
  password: string,
) {
  const existing = await repository.findOne({ where: { username } });
  const passwordHash = await bcrypt.hash(password, 10);

  if (existing) {
    existing.passwordHash = passwordHash;
    return repository.save(existing);
  }

  const user = repository.create({
    username,
    passwordHash,
  });
  return repository.save(user);
}
