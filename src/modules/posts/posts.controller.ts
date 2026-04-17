import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';

import { AccessTokenGuard } from '../../guards/access-token.guard';
import { CurrentUserId } from '../../decorators/current-user-id.decorator';
import { FilesInterceptor } from '@nestjs/platform-express';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @UseGuards(AccessTokenGuard)
  @Post()
  createPost(@CurrentUserId() userId: string, @Body() body: CreatePostDto) {
    return this.postsService.createPost(userId, body);
  }

  @UseGuards(AccessTokenGuard)
  @Post('upload-media')
  @UseInterceptors(FilesInterceptor('files', 2)) // gắn file vào request
  uploadMedia(
    @CurrentUserId() userId: string,
    @UploadedFiles() files: Express.Multer.File[], // thay vì dùng request.file thì dùng cái này tương tự với Guards nhen
  ) {
    return this.postsService.uploadMedia(userId, files);
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

  @UseGuards(AccessTokenGuard)
  @Post(':postId/like')
  likePost(@CurrentUserId() userId: string, @Param('postId') postId: string) {
    return this.postsService.likePost(userId, postId);
  }

  @UseGuards(AccessTokenGuard)
  @Delete(':postId/like')
  unlikePost(@CurrentUserId() userId: string, @Param('postId') postId: string) {
    return this.postsService.unlikePost(userId, postId);
  }

  @UseGuards(AccessTokenGuard)
  @Post(':postId/bookmark')
  bookmarkPost(
    @CurrentUserId() userId: string,
    @Param('postId') postId: string,
  ) {
    return this.postsService.bookmarkPost(userId, postId);
  }

  @UseGuards(AccessTokenGuard)
  @Delete(':postId/bookmark')
  unbookmarkPost(
    @CurrentUserId() userId: string,
    @Param('postId') postId: string,
  ) {
    return this.postsService.unbookmarkPost(userId, postId);
  }
}
