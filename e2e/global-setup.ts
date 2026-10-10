import { execFileSync } from 'node:child_process'
import path from 'node:path'

export default function globalSetup() {
  execFileSync(path.join(__dirname, 'reset-db.sh'), { stdio: 'inherit' })
}
