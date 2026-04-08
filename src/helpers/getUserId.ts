import { UnauthorizedException } from '@nestjs/common';
import { supabase } from '../libs/supabase/supabase';
import type { User, AuthError } from '@supabase/supabase-js';
import { ERROR } from '../core/constants/message';

export const getUserId = async (authHeader?: string): Promise<string> => {
  const token = authHeader?.replace('Bearer ', '');
  if (!token) throw new UnauthorizedException(ERROR.MISSING_ACCESS_TOKEN);

  const { data, error } = (await supabase.auth.getUser(token)) as {
    data: { user: User | null };
    error: AuthError | null;
  };

  if (error || !data.user) {
    throw new UnauthorizedException(error?.message || 'Invalid token');
  }

  return data.user.id;
};
