import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  driver: 'd1-http',
  out: './drizzle',
} satisfies Config
