import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { supabase } from '../libs/supabase/supabase';
import type { Request } from 'express';
import type { User } from '@supabase/supabase-js';
import { COMMON_ERROR } from '../core/constants/common.constant';

export type AuthenticatedRequest = Request & {
  user: User;
  accessToken: string;
};

@Injectable()
export class AccessTokenGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authHeader = request.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      throw new UnauthorizedException(COMMON_ERROR.MISSING_ACCESS_TOKEN);
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException(
        error?.message || COMMON_ERROR.INVALID_TOKEN,
      );
    }

    request.user = data.user;
    request.accessToken = token;

    return true;
  }
}
