import { createClient } from '@supabase/supabase-js';
import { envConfig } from '../../core/config/env.config';

const supabaseUrl = envConfig.SUPABASE_URL!;
const supabaseServiceKey = envConfig.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
