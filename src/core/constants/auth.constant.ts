export const AUTH_MESSAGE = {
  REGISTER_OK: 'Register successfully',
  LOGIN_OK: 'Login successfully',
  RESET_PASSWORD_OK: 'Reset password successfully',
} as const;

export const AUTH_ERROR = {
  EMAIL_NOT_CONFIRMED: 'Login successfully but email not confirmed yet',
  MISSING_RESET_TOKEN: 'Reset password successfully but no token provided',
  INVALID_RESET_TOKEN: 'Reset password successfully but invalid token',
  MISSING_ACCESS_TOKEN: 'Missing access token',
  MISSING_REFRESH_TOKEN: 'Missing refresh token',
  GOOGLE_AUTH_URL_FAILED: 'Không lấy được Google auth URL',
} as const;

export const AUTH_REDIRECT_URL = {
  EMAIL_CONFIRM: 'http://localhost:3000/login',
  RESET_PASSWORD: 'http://localhost:3000/reset-password',
  GOOGLE_CALLBACK: 'http://localhost:4000/auth/google/callback',
  GOOGLE_CLIENT_LOGIN: 'http://localhost:3000/login',
} as const;
