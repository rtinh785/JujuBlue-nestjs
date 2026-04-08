import { BadRequestException } from '@nestjs/common';
import { supabase } from '../libs/supabase/supabase';
import type { PostgrestError } from '@supabase/supabase-js';
import { Profile } from '../modules/profiles/dto/getMyProfile.dto';

export const updateProfile = async (
  userId: string,
  payload: Partial<Profile>,
): Promise<Profile> => {
  const res = (await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select('*')
    .single()) as { data: Profile; error: PostgrestError | null };

  if (res.error) throw new BadRequestException(res.error.message);
  return res.data;
};
