import type { JwtModuleOptions } from '@nestjs/jwt';

export function jwtOptions(): JwtModuleOptions {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 non-padding characters');
  }
  const configured = process.env.JWT_EXPIRES_IN ?? '8h';
  // Explicit units avoid jsonwebtoken's surprising interpretation of numeric strings as milliseconds.
  const match = /^(\d+)(s|m|h|d|w)?$/.exec(configured);
  if (!match) throw new Error('JWT_EXPIRES_IN must be seconds or a duration such as 8h');
  const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  const expiresIn = Number(match[1]) * units[match[2] ?? 's'];
  if (!Number.isSafeInteger(expiresIn) || expiresIn <= 0) throw new Error('JWT_EXPIRES_IN must be a positive duration');
  return {
    secret,
    signOptions: { algorithm: 'HS256', issuer: 'dexa-wfh', audience: 'dexa-web', expiresIn },
    verifyOptions: { algorithms: ['HS256'], issuer: 'dexa-wfh', audience: 'dexa-web' },
  };
}
