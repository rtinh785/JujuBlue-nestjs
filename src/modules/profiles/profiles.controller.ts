import { Controller, Get, Headers } from '@nestjs/common';
import { ProfilesService } from './profiles.service';

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('me')
  me(@Headers('authorization') authHeader: string) {
    return this.profilesService.me(authHeader);
  }
}
