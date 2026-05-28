import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '@/decorators/current-user-id.decorator';
import { AccessTokenGuard } from '@/guards/access-token.guard';
import { MessagesService } from './messages.service';

@Controller('messages')
@UseGuards(AccessTokenGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('conversations')
  getConversations(
    @CurrentUserId() userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagesService.getConversations(userId, {
      cursor,
      limit,
    });
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUserId() userId: string) {
    return this.messagesService.getUnreadCount(userId);
  }

  @Post('conversations')
  createOrGetConversation(
    @CurrentUserId() userId: string,
    @Body('receiverId') receiverId?: string,
  ) {
    return this.messagesService.createOrGetConversation(userId, receiverId);
  }

  @Get('conversations/:conversationId/messages')
  getMessages(
    @CurrentUserId() userId: string,
    @Param('conversationId') conversationId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagesService.getMessages(userId, conversationId, {
      cursor,
      limit,
    });
  }

  @Post('conversations/:conversationId/messages')
  sendMessage(
    @CurrentUserId() userId: string,
    @Param('conversationId') conversationId: string,
    @Body('content') content?: string,
  ) {
    return this.messagesService.sendMessage(userId, conversationId, content);
  }

  @Patch('conversations/:conversationId/read')
  markConversationRead(
    @CurrentUserId() userId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.messagesService.markConversationRead(userId, conversationId);
  }
}
