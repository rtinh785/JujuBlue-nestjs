import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgotPassword.dto';
import { ResetPasswordDto } from './dto/resetPassword.dth';
import type { User } from '@supabase/supabase-js';
import { AUTH } from '../../core/constants/message';
import { supabase } from '../../libs/supabase/supabase';

@Injectable()
export class AuthService {
  async register(data: RegisterDto) {
    const { email, password } = data;

    const { data: result, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: 'http://localhost:3000/login',
      },
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      message: AUTH.REGISTER_OK,
      user: result.user,
    };
  }

  async login(data: LoginDto) {
    const { email, password } = data;

    const { data: result, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new UnauthorizedException(error.message);
    }

    if (!result.user?.email_confirmed_at) {
      throw new UnauthorizedException(
        AUTH.LOGIN_OK + ' but email not confirmed yet',
      );
    }

    return {
      message: AUTH.LOGIN_OK,
      session: result.session,
      user: result.user,
    };
  }

  async forgotPassword(data: ForgotPasswordDto) {
    const { email } = data;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'http://localhost:3000/reset-password',
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { message: AUTH.RESET_PASSWORD_OK };
  }

  async resetPassword(body: ResetPasswordDto, authHeader?: string) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException(
        AUTH.RESET_PASSWORD_OK + ' but no token provided',
      );
    }

    const { data: userData, error: userError } =
      await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      throw new UnauthorizedException(
        userError?.message || AUTH.RESET_PASSWORD_OK + ' but invalid token',
      );
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      userData.user.id,
      { password: body.new_password },
    );

    if (updateError) {
      throw new BadRequestException(updateError.message);
    }

    return { message: AUTH.RESET_PASSWORD_OK };
  }

  getGoogleAuthUrl() {
    return supabase.auth
      .signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'http://localhost:4000/auth/google/callback',
        },
      })
      .then(({ data }) => data.url);
  }

  async handleGoogleCallback(code: string) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.session) {
      return null;
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    };
  }

  async me(authHeader?: string): Promise<{ user: User }> {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Missing access token');

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException(error?.message);

    return { user: data.user };
  }

  async logout(authHeader?: string): Promise<{ user: User }> {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Missing access token');

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException(error?.message);

    await supabase.auth.signOut();

    return { user: data.user };
  }

  async refreshAccessToken(refreshToken: string) {
    if (!refreshToken) {
      throw new BadRequestException('Missing refresh token');
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) {
      throw new UnauthorizedException(error.message);
    }

    return {
      session: data.session,
      user: data.user,
    };
  }
}
