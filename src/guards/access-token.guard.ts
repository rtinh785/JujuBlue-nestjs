import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { supabase } from '../libs/supabase/supabase';
import type { Request } from 'express';
import type { User } from '@supabase/supabase-js';

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
      throw new UnauthorizedException('Missing access token');
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException(error?.message || 'Invalid token');
    }

    request.user = data.user;
    request.accessToken = token;

    return true;
  }
}
