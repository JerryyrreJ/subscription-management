export const DEFAULT_USER_NICKNAME = 'User';

export const resolveUserProfileNickname = (nickname: unknown): string => {
 if (typeof nickname !== 'string') {
  return DEFAULT_USER_NICKNAME;
 }

 const trimmed = nickname.trim();
 if (trimmed.length < 2 || trimmed.length > 30) {
  return DEFAULT_USER_NICKNAME;
 }

 return trimmed;
};
