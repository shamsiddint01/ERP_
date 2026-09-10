import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { Public } from '../../shared/decorators/public.decorator.js';
import type { AuthenticatedRequest, AuthenticatedUser } from '../../shared/types/authenticated-request.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';

const REFRESH_COOKIE_NAME = 'refresh_token';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  // Tighter than the global 100/min limit — brute-force protection on the
  // credential-checking endpoints (per client IP).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, refreshTokenExpiresAt, user } = await this.authService.login(dto, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    this.setRefreshCookie(res, refreshToken, refreshTokenExpiresAt);
    return { accessToken, user };
  }

  // Looser than login — a valid httpOnly cookie is required, and multi-tab /
  // page-reload bursts are normal. Still bounded against cookie-replay floods.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!token) throw new UnauthorizedException('No refresh token provided');

    const { accessToken, refreshToken, refreshTokenExpiresAt } = await this.authService.refresh(token, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    this.setRefreshCookie(res, refreshToken, refreshTokenExpiresAt);
    return { accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (token) await this.authService.logout(token);
    res.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.id);
  }

  private setRefreshCookie(res: Response, refreshToken: string, expiresAt: Date): void {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, { ...this.cookieOptions(), expires: expiresAt });
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
    };
  }
}
