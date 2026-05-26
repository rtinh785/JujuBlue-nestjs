import { CurrentUserId } from '@/decorators/current-user-id.decorator';
import { AccessTokenGuard } from '@/guards/access-token.guard';
import { SearchService } from '@/modules/search/search.service';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @UseGuards(AccessTokenGuard)
  @Get()
  search(
    @CurrentUserId() userId: string,
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('sort') sort?: string,
  ) {
    return this.searchService.search(userId, {
      q,
      type,
      sort,
    });
  }
}
