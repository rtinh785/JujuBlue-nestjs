import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { supabase } from '../../libs/supabase/supabase';
import type { User, AuthError, PostgrestError } from '@supabase/supabase-js';
import { Profile } from './dto/getMyProfile.dto';
import { UpdateProfilePayload } from './dto/updateMyProfile';
import { randomUUID } from 'node:crypto';
import { ERROR } from '../../core/constants/message';
import { getUserId } from '../../helpers/getUserId';
import { updateProfile } from '../../helpers/updateProfile';

@Injectable()
export class ProfilesService {
  async me(authHeader?: string) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException(ERROR.MISSING_ACCESS_TOKEN);

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
    console.log(profile);
    if (profile) return profile;

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

  async updateMe(
    authHeader?: string,
    payload?: UpdateProfilePayload,
  ): Promise<{ profile: Profile }> {
    const userId = await getUserId(authHeader);
    const profile = await updateProfile(userId, payload ?? {});
    return { profile };
  }

  async uploadAvatar(
    authHeader?: string,
    file?: Express.Multer.File,
  ): Promise<{ profile: Profile }> {
    const userId = await getUserId(authHeader);
    if (!file) throw new BadRequestException(ERROR.MISSING_FILE);

    const ext = file.originalname.split('.').pop() || 'jpg';
    const fileName = `avatars/${userId}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) throw new BadRequestException(uploadError.message);

    const { data: publicUrl } = supabase.storage
      .from('images')
      .getPublicUrl(fileName);

    const profile = await updateProfile(userId, {
      avatar_url: publicUrl.publicUrl,
    });
    return { profile };
  }

  async uploadCover(
    authHeader?: string,
    file?: Express.Multer.File,
  ): Promise<{ profile: Profile }> {
    const userId = await getUserId(authHeader);
    if (!file) throw new BadRequestException(ERROR.MISSING_FILE);

    const ext = file.originalname.split('.').pop() || 'jpg';
    const fileName = `cover-photos/${userId}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) throw new BadRequestException(uploadError.message);

    const { data: publicUrl } = supabase.storage
      .from('images')
      .getPublicUrl(fileName);

    const profile = await updateProfile(userId, {
      cover_photo_url: publicUrl.publicUrl,
    });
    return { profile };
  }

  async getProfileById(id: string): Promise<Profile> {
    const { data, error } = (await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single()) as {
      data: Profile;
      error: PostgrestError | null;
    };

    if (error) throw new BadRequestException(error.message);

    return data;
  }
}
