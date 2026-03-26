import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { Response } from "express";
import type { AuthConfig } from "../config/auth.config";
import { ensureAdminUserExists } from "../database/seeds/admin-user.seed";
import { LoginDto } from "./auth.dto";
import { UsersService } from "../users/users.service";

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    const auth = this.configService.getOrThrow<AuthConfig>("auth");
    await ensureAdminUserExists(this.usersService.getRepository(), auth.adminUsername, auth.adminPassword);
  }

  async login(dto: LoginDto, response: Response) {
    const user = await this.usersService.findByUsername(dto.username);

    if (!user) {
      throw new UnauthorizedException("用户名或密码错误");
    }

    const matched = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matched) {
      throw new UnauthorizedException("用户名或密码错误");
    }

    const token = await this.jwtService.signAsync({
      sub: user.id,
      username: user.username,
    });
    const auth = this.configService.getOrThrow<AuthConfig>("auth");

    response.cookie(auth.cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: auth.cookieSecure,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });

    return {
      user: {
        id: user.id,
        username: user.username,
      },
    };
  }

  logout(response: Response) {
    const auth = this.configService.getOrThrow<AuthConfig>("auth");
    response.clearCookie(auth.cookieName);
    return { success: true };
  }
}
