import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { PostsService } from './posts.service';
import { AccessTokenGuard } from '../../guards/access-token.guard';
import type { AuthenticatedRequest } from '../../guards/access-token.guard';
import { CurrentUserId } from '../../decorators/current-user-id.decorator';
import { FilesInterceptor } from '@nestjs/platform-express';
import { UpdatePostDto } from './dto/update-post.dto';
import { SharePostDto } from './dto/share-post.dto';

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
  getFeed(
    @Headers('authorization') authHeader?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.postsService.getFeed(authHeader, {
      limit,
      cursor,
    });
  }

  @UseGuards(AccessTokenGuard)
  @Patch(':postId')
  updatePost(
    @Param('postId') postId: string,
    @Body() body: UpdatePostDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.postsService.updatePost(postId, req.user.id, body);
  }

  @UseGuards(AccessTokenGuard)
  @Delete(':postId')
  deletePost(
    @Param('postId') postId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.postsService.deletePost(postId, req.user.id);
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

  @UseGuards(AccessTokenGuard)
  @Get('counts')
  getCount(@CurrentUserId() userId: string) {
    return this.postsService.getCounts(userId);
  }

  @UseGuards(AccessTokenGuard)
  @Get('bookmark')
  getBookmark(@CurrentUserId() userId: string) {
    return this.postsService.getBookmark(userId);
  }

  @Get('trending')
  getTrendingPosts(@Headers('authorization') authHeader?: string) {
    return this.postsService.getTrendingPosts(authHeader);
  }

  @Get(':postId')
  getPostById(
    @Param('postId') postId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    return this.postsService.getPostById(postId, authHeader);
  }

  @Get(':postId/comments')
  getComments(
    @Param('postId') postId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    return this.postsService.getComments(postId, authHeader);
  }

  @UseGuards(AccessTokenGuard)
  @Post(':postId/comments')
  createComment(
    @CurrentUserId() userId: string,
    @Param('postId') postId: string,
    @Body() body: CreateCommentDto,
  ) {
    return this.postsService.createComment(userId, postId, body);
  }

  @UseGuards(AccessTokenGuard)
  @Post(':postId/share')
  sharePost(
    @CurrentUserId() userId: string,
    @Param('postId') postId: string,
    @Body() body: SharePostDto,
  ) {
    return this.postsService.sharePost(userId, postId, body);
  }
}
