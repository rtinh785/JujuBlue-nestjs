import { GROUPED_NOTIFICATION_TYPES } from '../core/constants/notification.constant';

export const isGroupedNotificationType = (type: string) => {
  return GROUPED_NOTIFICATION_TYPES.includes(
    type as (typeof GROUPED_NOTIFICATION_TYPES)[number],
  );
};
