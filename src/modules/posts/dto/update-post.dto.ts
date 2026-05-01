import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PostVisibility } from '../../../core/enums/post-visibility.enum';

export class UpdatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(280)
  content?: string;

  @IsOptional()
  @IsEnum(PostVisibility)
  visibility?: PostVisibility;
}
