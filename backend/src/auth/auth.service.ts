import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { Response } from "express";
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
    const username = this.configService.get<string>("ADMIN_USERNAME", "admin");
    const password = this.configService.get<string>("ADMIN_PASSWORD", "admin123456");
    await this.usersService.ensureAdminUser(username, password);
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
    const secure = this.configService.get<string>("COOKIE_SECURE", "false") === "true";

    response.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
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
    response.clearCookie("token");
    return { success: true };
  }
}
