import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CreateNotificationInput,
  NotificationListItem,
} from '../../types/notification.type';
import { supabase } from '../../libs/supabase/supabase';
import type { Json } from '../../types/database.types';
import {
  NOTIFICATION_ERROR,
  NOTIFICATION_MESSAGE,
  NOTIFICATION_QUERY,
  NOTIFICATION_TYPE,
} from '../../core/constants/notification.constant';
import { NOTIFICATION_WITH_ACTOR_SELECT } from '../../core/constants/select/notification.select';
import { isGroupedNotificationType } from '../../helpers/notification.helper';

@Injectable()
export class NotificationsService {
  async createNotification(input: CreateNotificationInput) {
    if (input.recipientId === input.actorId) {
      return null;
    }

    const metadata = (input.metadata ?? {}) as Json;

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        recipient_id: input.recipientId,
        actor_id: input.actorId,
        type: input.type,
        target_post_id: input.targetPostId ?? null,
        target_comment_id: input.targetCommentId ?? null,
        target_reply_id: input.targetReplyId ?? null,
        target_user_id: input.targetUserId ?? null,
        share_post_id: input.sharePostId ?? null,
        group_key: input.groupKey,
        metadata,
      })
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, group_key')
      .eq('recipient_id', userId)
      .is('clicked_at', null);

    if (error) {
      throw new BadRequestException(error.message);
    }

    const unreadGroupKeys = new Set<string>();
    let unreadSingleCount = 0;

    for (const notification of data ?? []) {
      if (isGroupedNotificationType(notification.type)) {
        unreadGroupKeys.add(notification.group_key);
        continue;
      }

      unreadSingleCount += 1;
    }

    return {
      unreadCount: unreadGroupKeys.size + unreadSingleCount,
    };
  }

  async markClicked(
    userId: string,
    notificationId: string,
  ): Promise<{ message: string }> {
    if (!notificationId) {
      throw new BadRequestException(NOTIFICATION_ERROR.MISSING_NOTIFICATION_ID);
    }

    const { data: notification, error: findError } = await supabase
      .from('notifications')
      .select('id, recipient_id, clicked_at')
      .eq('id', notificationId)
      .maybeSingle();

    if (findError) {
      throw new BadRequestException(findError.message);
    }

    if (!notification) {
      throw new BadRequestException(NOTIFICATION_ERROR.NOT_FOUND);
    }

    if (notification.recipient_id !== userId) {
      throw new BadRequestException(NOTIFICATION_ERROR.NOT_ALLOWED_UPDATE);
    }

    if (notification.clicked_at) {
      return { message: NOTIFICATION_MESSAGE.ALREADY_CLICKED };
    }

    const { error: updateError } = await supabase
      .from('notifications')
      .update({
        clicked_at: new Date().toISOString(),
      })
      .eq('id', notificationId);

    if (updateError) {
      throw new BadRequestException(updateError.message);
    }

    return { message: NOTIFICATION_MESSAGE.MARKED_AS_CLICKED };
  }

  async getNotifications(userId: string) {
    const { data, error } = await supabase
      .from('notifications')
      .select(NOTIFICATION_WITH_ACTOR_SELECT)
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(NOTIFICATION_QUERY.DEFAULT_LIMIT);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      notifications: data ?? [],
    };
  }

  async getGroupedNotifications(
    userId: string,
  ): Promise<{ notifications: NotificationListItem[] }> {
    const { data, error } = await supabase
      .from('notifications')
      .select(NOTIFICATION_WITH_ACTOR_SELECT)
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(NOTIFICATION_QUERY.DEFAULT_LIMIT);

    if (error) {
      throw new BadRequestException(error.message);
    }

    const notificationList: NotificationListItem[] = [];
    const groupedMap = new Map<string, NotificationListItem>();

    for (const notification of data ?? []) {
      const shouldGroup = isGroupedNotificationType(notification.type);

      const listItem: NotificationListItem = {
        id: notification.id,
        type: notification.type as NotificationListItem['type'],
        group_key: notification.group_key,
        clicked_at: notification.clicked_at,
        created_at: notification.created_at,
        is_grouped: false,
        actor_count: 1,
        other_actor_count: 0,
        actor: notification.actor,
        target_post_id: notification.target_post_id,
        target_comment_id: notification.target_comment_id,
        target_reply_id: notification.target_reply_id,
        target_user_id: notification.target_user_id,
        share_post_id: notification.share_post_id,
        metadata: notification.metadata,
      };

      if (!shouldGroup) {
        notificationList.push(listItem);
        continue;
      }

      const existingGroup = groupedMap.get(notification.group_key);

      if (!existingGroup) {
        groupedMap.set(notification.group_key, listItem);
        notificationList.push(listItem);
        continue;
      }

      existingGroup.is_grouped = true;
      existingGroup.actor_count += 1;
      existingGroup.other_actor_count = existingGroup.actor_count - 1;

      if (!notification.clicked_at) {
        existingGroup.clicked_at = null;
      }
    }

    return {
      notifications: notificationList,
    };
  }

  async markGroupClicked(
    userId: string,
    groupKey: string,
  ): Promise<{ message: string }> {
    if (!groupKey) {
      throw new BadRequestException(NOTIFICATION_ERROR.MISSING_GROUP_KEY);
    }

    const { data: notifications, error: findError } = await supabase
      .from('notifications')
      .select('id, type')
      .eq('recipient_id', userId)
      .eq('group_key', groupKey)
      .limit(1);

    if (findError) {
      throw new BadRequestException(findError.message);
    }

    const notification = notifications?.[0];

    if (!notification) {
      throw new BadRequestException(NOTIFICATION_ERROR.NOT_FOUND);
    }

    if (!isGroupedNotificationType(notification.type)) {
      throw new BadRequestException(NOTIFICATION_ERROR.NOT_GROUPED_TYPE);
    }

    const { error } = await supabase
      .from('notifications')
      .update({
        clicked_at: new Date().toISOString(),
      })
      .eq('recipient_id', userId)
      .eq('group_key', groupKey)
      .is('clicked_at', null);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      message: NOTIFICATION_MESSAGE.GROUP_MARKED_AS_CLICKED,
    };
  }

  async getGroupActors(userId: string, groupKey: string) {
    if (!groupKey) {
      throw new BadRequestException(NOTIFICATION_ERROR.MISSING_GROUP_KEY);
    }

    const { data, error } = await supabase
      .from('notifications')
      .select(
        `
      id,
      actor:profiles!notifications_actor_id_fkey (
        id,
        username,
        display_name,
        avatar_url
      )
    `,
      )
      .eq('recipient_id', userId)
      .eq('group_key', groupKey)
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      actors: (data ?? []).map((item) => item.actor).filter(Boolean),
    };
  }

  async deleteLikeNotification(actorId: string, postId: string) {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('actor_id', actorId)
      .eq('type', NOTIFICATION_TYPE.LIKE_POST)
      .eq('target_post_id', postId);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { message: NOTIFICATION_MESSAGE.LIKE_NOTIFICATION_DELETED };
  }

  async deleteFollowNotification(actorId: string, recipientId: string) {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('actor_id', actorId)
      .eq('recipient_id', recipientId)
      .eq('type', NOTIFICATION_TYPE.FOLLOW_USER)
      .eq('target_user_id', actorId);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { message: NOTIFICATION_MESSAGE.FOLLOW_NOTIFICATION_DELETED };
  }

  async deleteShareNotification(actorId: string, sharePostId: string) {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('actor_id', actorId)
      .eq('type', NOTIFICATION_TYPE.SHARE_POST)
      .eq('share_post_id', sharePostId);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { message: NOTIFICATION_MESSAGE.SHARE_NOTIFICATION_DELETED };
  }

  async deleteCommentNotifications(postIds: string[]) {
    if (postIds.length === 0) {
      return { message: NOTIFICATION_MESSAGE.COMMENT_NOTIFICATIONS_DELETED };
    }

    const { error } = await supabase
      .from('notifications')
      .delete()
      .or(
        `target_comment_id.in.(${postIds.join(',')}),target_reply_id.in.(${postIds.join(',')})`,
      );

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { message: NOTIFICATION_MESSAGE.COMMENT_NOTIFICATIONS_DELETED };
  }

  async deletePostNotifications(postIds: string[]) {
    if (postIds.length === 0) {
      return { message: NOTIFICATION_MESSAGE.POST_NOTIFICATIONS_DELETED };
    }

    const ids = postIds.join(',');

    const { error } = await supabase
      .from('notifications')
      .delete()
      .or(
        [
          `target_post_id.in.(${ids})`,
          `target_comment_id.in.(${ids})`,
          `target_reply_id.in.(${ids})`,
          `share_post_id.in.(${ids})`,
        ].join(','),
      );

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { message: NOTIFICATION_MESSAGE.POST_NOTIFICATIONS_DELETED };
  }
}
