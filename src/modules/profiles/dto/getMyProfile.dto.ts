export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  created_at: string | null;
  updated_at: string | null;
  date_of_birth: string | null;
  cover_photo_url: string | null;
  cover_photo_offset_y: number | null;
};
