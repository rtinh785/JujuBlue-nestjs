import { Json } from '../../../types/database.types';

export class CreatePostDto {
  content?: string;
  media?: Json[] | null;
  visibility!: 'public' | 'followers' | 'private';
}
