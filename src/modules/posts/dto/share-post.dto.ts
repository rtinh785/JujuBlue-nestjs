import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SharePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsString()
  @IsIn(['public', 'followers', 'private'])
  visibility?: 'public' | 'followers' | 'private';
}
