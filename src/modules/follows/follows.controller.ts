import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { FollowsService } from './follows.service';
import type { CreateFollowDto } from './dto/createFollow.dto';

@Controller('follows')
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}
  @Get('suggestions')
  getSuggestions(@Headers('authorization') authHeader: string) {
    return this.followsService.getSuggestions(authHeader);
  }

  @Post()
  followUser(
    @Headers('authorization') authHeader: string,
    @Body() body: CreateFollowDto,
  ): Promise<{ message: string }> {
    return this.followsService.followUser(authHeader, body);
  }

  @Get('check/:followingUserId')
  checkFollowing(
    @Headers('authorization') authHeader: string,
    @Param('followingUserId') followingUserId: string,
  ) {
    return this.followsService.checkFollowing(authHeader, followingUserId);
  }

  @Delete(':followingUserId')
  unfollowUser(
    @Headers('authorization') authHeader: string,
    @Param('followingUserId') followingUserId: string,
  ): Promise<{ message: string }> {
    return this.followsService.unfollowUser(authHeader, followingUserId);
  }

  @Get('counts')
  getCounts(@Headers('authorization') authHeader: string) {
    return this.followsService.getCounts(authHeader);
  }

  @Get('following')
  getFollowing(@Headers('authorization') authHeader: string) {
    return this.followsService.getFollowing(authHeader);
  }
}
