import { BadRequestException, Injectable } from '@nestjs/common';
import { SuggestedProfile } from './dto/suggestProfile.dto';
import { getUserId } from '../../helpers/getUserId';
import { supabase } from '../../libs/supabase/supabase';
import { PostgrestError } from '@supabase/supabase-js';
import { CreateFollowDto } from './dto/createFollow.dto';
import { NotificationsService } from '../notifications/notifications.service';
import {
  FOLLOW_ERROR,
  FOLLOW_MESSAGE,
  FOLLOW_SUGGESTION,
} from '../../core/constants/follow.constant';
export type FollowingProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};
@Injectable()
export class FollowsService {
  constructor(private readonly notificationsService: NotificationsService) {}

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
      profiles: shuffled.slice(0, FOLLOW_SUGGESTION.LIMIT),
    };
  }

  async followUser(
    authHeader?: string,
    body?: CreateFollowDto,
  ): Promise<{ message: string }> {
    const followerId = await getUserId(authHeader);
    const followingUserId = body?.followingUserId;

    if (!followingUserId) {
      throw new BadRequestException(FOLLOW_ERROR.MISSING_FOLLOWING_USER_ID);
    }

    if (followerId === followingUserId) {
      throw new BadRequestException(FOLLOW_ERROR.CANNOT_FOLLOW_YOURSELF);
    }

    const { error } = await supabase.from('follows').insert({
      follower_id: followerId,
      following_id: followingUserId,
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    await this.notificationsService.createNotification({
      recipientId: followingUserId,
      actorId: followerId,
      type: 'follow_user',
      targetUserId: followerId,
      groupKey: `follow_user:${followingUserId}`,
    });

    return { message: FOLLOW_MESSAGE.FOLLOW_OK };
  }

  async checkFollowing(
    authHeader?: string,
    followingUserId?: string,
  ): Promise<{ isFollowing: boolean }> {
    const followerId = await getUserId(authHeader);
    if (!followingUserId) {
      throw new BadRequestException(FOLLOW_ERROR.MISSING_FOLLOWING_USER_ID);
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
      throw new BadRequestException(FOLLOW_ERROR.MISSING_FOLLOWING_USER_ID);
    }

    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', followingUserId);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { message: FOLLOW_MESSAGE.UNFOLLOW_OK };
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
