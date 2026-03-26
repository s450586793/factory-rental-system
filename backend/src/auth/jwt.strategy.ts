import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Request } from "express";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { AuthConfig } from "../config/auth.config";
import { UsersService } from "../users/users.service";

type JwtPayload = {
  sub: string;
  username: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const auth = configService.getOrThrow<AuthConfig>("auth");
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request & { cookies?: Record<string, string> }) =>
          request?.cookies?.[auth.cookieName] ?? null,
      ]),
      secretOrKey: auth.jwtSecret,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findByUsername(payload.username);

    if (!user || user.id !== payload.sub) {
      throw new UnauthorizedException("登录状态已失效");
    }

    return {
      id: user.id,
      username: user.username,
    };
  }
}
