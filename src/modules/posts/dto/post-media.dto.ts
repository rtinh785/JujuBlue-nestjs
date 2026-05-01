import { IsIn, IsString } from 'class-validator';

export class PostMediaDto {
  @IsString()
  url!: string;

  @IsString()
  @IsIn(['image', 'video'])
  type!: 'image' | 'video';
}
