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
import { supabase } from '../../libs/supabase/supabase';
import {
  AUTH_ERROR,
  AUTH_MESSAGE,
  AUTH_REDIRECT_URL,
} from '../../core/constants/auth.constant';

@Injectable()
export class AuthService {
  async register(data: RegisterDto) {
    const { email, password } = data;

    const { data: result, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: AUTH_REDIRECT_URL.EMAIL_CONFIRM,
      },
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      message: AUTH_MESSAGE.REGISTER_OK,
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
      throw new UnauthorizedException(AUTH_ERROR.EMAIL_NOT_CONFIRMED);
    }

    return {
      message: AUTH_MESSAGE.LOGIN_OK,
      session: result.session,
      user: result.user,
    };
  }

  async forgotPassword(data: ForgotPasswordDto) {
    const { email } = data;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: AUTH_REDIRECT_URL.RESET_PASSWORD,
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { message: AUTH_MESSAGE.RESET_PASSWORD_OK };
  }

  async resetPassword(body: ResetPasswordDto, authHeader?: string) {
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      throw new UnauthorizedException(AUTH_ERROR.MISSING_RESET_TOKEN);
    }

    const { data: userData, error: userError } =
      await supabase.auth.getUser(token);

    if (userError || !userData.user) {
      throw new UnauthorizedException(
        userError?.message || AUTH_ERROR.INVALID_RESET_TOKEN,
      );
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      userData.user.id,
      { password: body.new_password },
    );

    if (updateError) {
      throw new BadRequestException(updateError.message);
    }

    return { message: AUTH_MESSAGE.RESET_PASSWORD_OK };
  }

  getGoogleAuthUrl() {
    return supabase.auth
      .signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: AUTH_REDIRECT_URL.GOOGLE_CALLBACK,
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

    if (!token) {
      throw new UnauthorizedException(AUTH_ERROR.MISSING_ACCESS_TOKEN);
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException(error?.message);
    }

    return { user: data.user };
  }

  async logout(authHeader?: string): Promise<{ user: User }> {
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      throw new UnauthorizedException(AUTH_ERROR.MISSING_ACCESS_TOKEN);
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException(error?.message);
    }

    await supabase.auth.signOut();

    return { user: data.user };
  }

  async refreshAccessToken(refreshToken: string) {
    if (!refreshToken) {
      throw new BadRequestException(AUTH_ERROR.MISSING_REFRESH_TOKEN);
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
