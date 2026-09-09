import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..', '..');
const rows = JSON.parse(await fs.readFile(path.join(project, 'exhibition_dashboard', 'contacts.json'), 'utf8'));
const sql = value => `'${String(value ?? '').replaceAll("'", "''")}'`;
const statements = rows
  .filter(row => Array.isArray(row.qrData) && row.qrData.length)
  .map(row => `UPDATE contacts SET qr_data = ${sql(JSON.stringify(row.qrData))} WHERE id = ${sql(row.id)};`);
const output = path.join(project, 'cloudflare', 'private', 'qr-update.sql');
await fs.writeFile(output, `${statements.join('\n')}\n`, 'utf8');
console.log(`Generated ${statements.length} QR updates at ${output}`);
