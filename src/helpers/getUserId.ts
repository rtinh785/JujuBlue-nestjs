import { UnauthorizedException } from '@nestjs/common';
import { supabase } from '../libs/supabase/supabase';
import type { User, AuthError } from '@supabase/supabase-js';
import { COMMON_ERROR } from '../core/constants/common.constant';

export const getUserId = async (authHeader?: string): Promise<string> => {
  const token = authHeader?.replace('Bearer ', '');
  if (!token)
    throw new UnauthorizedException(COMMON_ERROR.MISSING_ACCESS_TOKEN);

  const { data, error } = (await supabase.auth.getUser(token)) as {
    data: { user: User | null };
    error: AuthError | null;
  };

  if (error || !data.user) {
    throw new UnauthorizedException(
      error?.message || COMMON_ERROR.INVALID_TOKEN,
    );
  }

  return data.user.id;
};
