import { BadRequestException, Injectable } from '@nestjs/common';
import { SuggestedProfile } from './dto/suggestProfile.dto';
import { getUserId } from '../../helpers/getUserId';
import { supabase } from '../../libs/supabase/supabase';
import { PostgrestError } from '@supabase/supabase-js';
import { Profile } from '../profiles/dto/getMyProfile.dto';

@Injectable()
export class FollowsService {
  async getSuggestions(
    authHeader?: string,
  ): Promise<{ profiles: SuggestedProfile[] }> {
    const userId = await getUserId(authHeader);

    const { data: follows, error: followsError } = (await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)) as {
      data: { following_id: string }[] | null;
      error: PostgrestError | null;
    };

    if (followsError) throw new BadRequestException(followsError.message);

    const excludedIds = [
      userId,
      ...(follows?.map((item) => item.following_id) ?? []),
    ];

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .not('id', 'in', `(${excludedIds.join(',')})`);

    if (profilesError) throw new BadRequestException(profilesError.message);

    const shuffled = [...(profiles ?? [])].sort(() => Math.random() - 0.5);

    return {
      profiles: shuffled.slice(0, 5),
    };
  }
}
