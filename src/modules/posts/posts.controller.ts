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

import { AccessTokenGuard } from '../../guards/access-token.guard';
import { CurrentUserId } from '../../decorators/current-user-id.decorator';
import { UploadedFiles, UseInterceptors, UseGuards } from '@nestjs/common';
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
}
