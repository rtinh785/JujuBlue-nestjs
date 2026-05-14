const fs = require('fs')
const { execSync } = require('child_process')
require('dotenv').config()

const projectId = process.env.SUPABASE_PROJECT_ID

if (!projectId) {
    console.error('Missing SUPABASE_PROJECT_ID in .env')
    process.exit(1)
}

const output = execSync(
    `pnpm dlx supabase gen types typescript --project-id ${projectId} --schema public`,
    { encoding: 'utf8' },
)

fs.writeFileSync('src/types/database.types.tmp.ts', output)
console.log('Generated src/types/database.types.tmp.ts')
