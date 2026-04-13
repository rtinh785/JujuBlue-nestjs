import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Request,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../../guards/access-token.guard';
import { CurrentUserId } from '../../decorators/current-user-id.decorator';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @UseGuards(AccessTokenGuard)
  @Post()
  createPost(@CurrentUserId() userId: string, @Body() body: CreatePostDto) {
    return this.postsService.createPost(userId, body);
  }

  @Get('feed')
  getFeed(@Headers('authorization') authHeader?: string) {
    return this.postsService.getFeed(authHeader);
  }

  @Get('profile/:userId')
  getProfilePosts(
    @Param('userId') userId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    return this.postsService.getProfilePosts(authHeader, userId);
  }
}
