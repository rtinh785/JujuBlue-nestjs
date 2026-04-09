import { Controller, Get, Headers } from '@nestjs/common';
import { FollowsService } from './follows.service';

@Controller('follows')
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}
  @Get('suggestions')
  getSuggestions(@Headers('authorization') authHeader: string) {
    return this.followsService.getSuggestions(authHeader);
  }
}
