import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { supabase } from '../../libs/supabase/supabase';
import type { User, AuthError, PostgrestError } from '@supabase/supabase-js';

type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  created_at: string | null;
  updated_at: string | null;
  date_of_birth: string | null;
  cover_photo_url: string | null;
  cover_photo_offset_y: number | null;
};

@Injectable()
export class ProfilesService {
  async me(authHeader?: string) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Missing access token');

    const { data: userData, error: userError } = (await supabase.auth.getUser(
      token,
    )) as {
      data: { user: User | null };
      error: AuthError | null;
    };

    if (userError || !userData.user) {
      throw new UnauthorizedException(userError?.message || 'Invalid token');
    }

    const userId = userData.user.id;

    const { data: profile, error: profileError } = (await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()) as {
      data: Profile | null;
      error: PostgrestError | null;
    };

    if (profileError) throw new BadRequestException(profileError.message);

    if (profile) return { profile };

    const meta = (userData.user.user_metadata ?? {}) as {
      full_name?: string;
      avatar_url?: string;
    };

    const baseName =
      meta.full_name ||
      userData.user.email?.split('@')[0] ||
      `user_${userId.slice(0, 8)}`;

    const { data: newProfile, error: createError } = (await supabase
      .from('profiles')
      .insert({
        id: userId,
        username: baseName,
        display_name: baseName,
        avatar_url: meta.avatar_url ?? null,
      })
      .select('*')
      .single()) as {
      data: Profile;
      error: PostgrestError | null;
    };

    if (createError) throw new BadRequestException(createError.message);

    return { profile: newProfile };
  }
}
