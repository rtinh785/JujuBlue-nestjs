import { BadRequestException, Injectable } from '@nestjs/common';
import { SuggestedProfile } from './dto/suggestProfile.dto';
import { getUserId } from '../../helpers/getUserId';
import { supabase } from '../../libs/supabase/supabase';
import { PostgrestError } from '@supabase/supabase-js';
import { CreateFollowDto } from './dto/createFollow.dto';
export type FollowingProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};
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

  async followUser(
    authHeader?: string,
    body?: CreateFollowDto,
  ): Promise<{ message: string }> {
    const followerId = await getUserId(authHeader);
    const followingUserId = body?.followingUserId;

    if (!followingUserId) {
      throw new BadRequestException('Missing followingUserId');
    }

    if (followerId === followingUserId) {
      throw new BadRequestException('You cannot follow yourself');
    }

    const { error } = await supabase.from('follows').insert({
      follower_id: followerId,
      following_id: followingUserId,
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { message: 'follow user successfully' };
  }

  async checkFollowing(
    authHeader?: string,
    followingUserId?: string,
  ): Promise<{ isFollowing: boolean }> {
    const followerId = await getUserId(authHeader);
    if (!followingUserId) {
      throw new BadRequestException('Missing followingUserId');
    }

    const { data, error } = (await supabase
      .from('follows')
      .select('*')
      .eq('follower_id', followerId)
      .eq('following_id', followingUserId)
      .maybeSingle()) as {
      data: { follower_id: string; following_id: string } | null;
      error: PostgrestError | null;
    };

    if (error) throw new BadRequestException(error.message);

    return { isFollowing: !!data };
  }

  async unfollowUser(
    authHeader?: string,
    followingUserId?: string,
  ): Promise<{ message: string }> {
    const followerId = await getUserId(authHeader);

    if (!followingUserId) {
      throw new BadRequestException('Missing followingUserId');
    }

    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', followingUserId);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { message: 'unfollow user successfully' };
  }

  async getCounts(
    authHeader?: string,
  ): Promise<{ following: number; followers: number }> {
    const userId = await getUserId(authHeader);

    const { count: followingCount, error: followingError } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', userId);

    if (followingError) throw new BadRequestException(followingError.message);

    const { count: followersCount, error: followersError } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', userId);

    if (followersError) throw new BadRequestException(followersError.message);

    return {
      following: followingCount ?? 0,
      followers: followersCount ?? 0,
    };
  }

  async getFollowing(
    authHeader?: string,
  ): Promise<{ profiles: FollowingProfile[] }> {
    const userId = await getUserId(authHeader);

    const { data: follows, error: followsError } = (await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)) as {
      data: { following_id: string }[] | null;
      error: PostgrestError | null;
    };

    if (followsError) throw new BadRequestException(followsError.message);

    const followingIds = (follows ?? []).map((f) => f.following_id);

    if (followingIds.length === 0) {
      return { profiles: [] };
    }

    const { data: profiles, error: profilesError } = (await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', followingIds)) as {
      data: FollowingProfile[] | null;
      error: PostgrestError | null;
    };

    if (profilesError) throw new BadRequestException(profilesError.message);

    return { profiles: profiles ?? [] };
  }
}
