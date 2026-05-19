import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AccessTokenGuard } from '../../guards/access-token.guard';
import { CurrentUserId } from '../../decorators/current-user-id.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @UseGuards(AccessTokenGuard)
  @Get('unread-count')
  getUnreadCount(@CurrentUserId() userId: string) {
    return this.notificationsService.getUnreadCount(userId);
  }

  @UseGuards(AccessTokenGuard)
  @Get('grouped')
  getGroupedNotifications(
    @CurrentUserId() userId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.notificationsService.getGroupedNotifications(userId, {
      limit,
      cursor,
    });
  }

  @UseGuards(AccessTokenGuard)
  @Patch(':notificationId/clicked')
  markClicked(
    @CurrentUserId() userId: string,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notificationsService.markClicked(userId, notificationId);
  }

  @UseGuards(AccessTokenGuard)
  @Patch('groups/:groupKey/clicked')
  markGroupClicked(
    @CurrentUserId() userId: string,
    @Param('groupKey') groupKey: string,
  ) {
    return this.notificationsService.markGroupClicked(userId, groupKey);
  }

  @UseGuards(AccessTokenGuard)
  @Get()
  getNotifications(@CurrentUserId() userId: string) {
    return this.notificationsService.getNotifications(userId);
  }

  @UseGuards(AccessTokenGuard)
  @Get('groups/:groupKey/actors')
  getGroupActors(
    @CurrentUserId() userId: string,
    @Param('groupKey') groupKey: string,
  ) {
    return this.notificationsService.getGroupActors(userId, groupKey);
  }
}
