import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { UpdateProfilePayload } from './dto/updateMyProfile';
import { Profile } from './dto/getMyProfile.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('me')
  me(
    @Headers('authorization') authHeader: string,
  ): Promise<{ profile: Profile }> {
    return this.profilesService.me(authHeader);
  }

  @Patch('me')
  updateMe(
    @Headers('authorization') authHeader: string,
    @Body() body: UpdateProfilePayload,
  ): Promise<{ profile: Profile }> {
    return this.profilesService.updateMe(authHeader, body);
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file'))
  uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Headers('authorization') authHeader: string,
  ) {
    return this.profilesService.uploadAvatar(authHeader, file);
  }

  @Post('cover')
  @UseInterceptors(FileInterceptor('file'))
  uploadCover(
    @UploadedFile() file: Express.Multer.File,
    @Headers('authorization') authHeader: string,
  ) {
    return this.profilesService.uploadCover(authHeader, file);
  }

  @Get(':id')
  getProfileById(@Param('id') id: string): Promise<Profile> {
    return this.profilesService.getProfileById(id);
  }
}
