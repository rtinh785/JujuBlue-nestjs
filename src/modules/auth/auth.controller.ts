import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgotPassword.dto';
import { ResetPasswordDto } from './dto/resetPassword.dth';
import type { Response, Request } from 'express';
import type { User } from '@supabase/supabase-js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Post('forgot-password')
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body);
  }

  @Post('reset-password')
  resetPassword(
    @Body() body: ResetPasswordDto,
    @Headers('authorization') authHeader: string,
  ) {
    return this.authService.resetPassword(body, authHeader);
  }

  @Get('google')
  async googleLogin(@Res() res: Response) {
    const url = await this.authService.getGoogleAuthUrl();
    if (!url) {
      throw new BadRequestException('Không lấy được Google auth URL');
    }
    return res.redirect(url);
  }

  @Get('google/callback')
  googleCallback(@Res() res: Response) {
    return res.status(200).type('text/html').send(`
      <html>
        <body>
          <script>
            const hash = window.location.hash || '';
            window.location.href = 'http://localhost:3000/login' + hash;
          </script>
        </body>
      </html>
    `);
  }

  @Get('me')
  me(@Headers('authorization') authHeader: string): Promise<{ user: User }> {
    return this.authService.me(authHeader);
  }

  @Post('logout')
  logout(
    @Headers('authorization') authHeader: string,
  ): Promise<{ user: User }> {
    return this.authService.logout(authHeader);
  }

  @Post('refresh-access-token')
  refreshAccessToken(@Body() body: { refresh_token: string }) {
    return this.authService.refreshAccessToken(body.refresh_token);
  }
}
