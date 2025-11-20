import { registerAs } from '@nestjs/config';

export const socialConfig = registerAs('social', () => ({
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  },
  twitter: {
    apiBaseUrl: process.env.TWITTER_API_BASE_URL || 'https://api.twitter.com/2',
    clientId: process.env.TWITTER_CLIENT_ID || '',
    clientSecret: process.env.TWITTER_CLIENT_SECRET || '',
  },
  discord: {
    apiBaseUrl: process.env.DISCORD_API_BASE_URL || 'https://discord.com/api',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
  },
}));

export type SocialConfig = ReturnType<typeof socialConfig>;
