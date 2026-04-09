import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { FollowsModule } from './modules/follows/follows.module';

@Module({
  imports: [AuthModule, ProfilesModule, FollowsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
