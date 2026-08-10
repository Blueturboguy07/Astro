import { existsSync } from 'node:fs'
import path from 'node:path'
import { includeIgnoreFile } from '@eslint/compat'
import type { CodegenConfig } from '@graphql-codegen/cli'

// biome-ignore lint/style/noProcessEnv: env needed for codegen config
const env = process.env

/* `??` only falls back on null/undefined, not on ''. .env.development.example
   ships GRAPHQL_SCHEMA_PATH as a present-but-empty line (a fill-in-if-needed
   placeholder), so a `cp .env.development.example .env.development` with no
   further edits set this to '' rather than leaving it unset — silently
   turning "use the default schema" into "No schema found", and failing
   `bun run dev:setup` on step 3 of SETUP.md. Trim + `||` treats blank the
   same as unset. */
const schemaPath =
  env.GRAPHQL_SCHEMA_PATH?.trim() ||
  path.resolve(__dirname, 'schema/schema.graphql')
if (!existsSync(schemaPath)) {
  throw new Error(
    'No schema found. Either set GRAPHQL_SCHEMA_PATH in .env.development ' +
      'or ensure schema/schema.graphql exists',
  )
}

const gitignorePath = path.resolve(__dirname, '.gitignore')

const ignorePatterns = includeIgnoreFile(
  gitignorePath,
  'Imported .gitignore patterns',
)

const ignoresList = ignorePatterns.ignores?.map((each) => `!${each}`) ?? []

const config: CodegenConfig = {
  schema: schemaPath,
  documents: ['./**/*.tsx', './**/*.ts', ...ignoresList],
  ignoreNoDocuments: true,
  generates: {
    './generated/graphql/': {
      preset: 'client',
      config: {
        documentMode: 'string',
        // Pre-codegen-7 implicitly typed custom scalars as `any`,
        // which let our app code use them as strings without casts.
        // codegen 7's client-preset v6 narrowed unmapped scalars to
        // `unknown`. Pin our two custom scalars back to `string` so
        // call-sites that do `.endsWith(…)` / `new Date(…)` keep
        // typechecking. JSON stays `any` for the same reason.
        scalars: {
          Cursor: 'string',
          Datetime: 'string',
          JSON: 'any',
        },
      },
    },
    './generated/graphql/schema.graphql': {
      plugins: ['schema-ast'],
      config: {
        includeDirectives: true,
      },
    },
  },
}

export default config
