import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..', '..');
const input = path.join(project, 'exhibition_dashboard', 'contacts.json');
const output = path.join(project, 'cloudflare', 'private', 'seed.sql');

const rows = JSON.parse(await fs.readFile(input, 'utf8'));
const sql = value => `'${String(value ?? '').replaceAll("'", "''")}'`;
const columns = [
  'id', 'source_name', 'company', 'person', 'email', 'phone', 'exhibition', 'day',
  'relationship', 'category', 'followup', 'priority', 'notes', 'review_note',
  'status', 'good_enough', 'form_image_key', 'card_image_key', 'qr_data'
];
const statements = rows.map(row => {
  const values = [
    row.id, row.sourceName, row.company, row.person, row.email, row.phone,
    row.exhibition, row.day, row.relationship, row.category, row.followup,
    row.priority, row.notes, row.reviewNote, row.status || 'needs_review',
    row.goodEnough ? 1 : 0, row.formImage, row.cardImage, JSON.stringify(row.qrData || [])
  ];
  return `INSERT OR REPLACE INTO contacts (${columns.join(', ')}) VALUES (${values.map(sql).join(', ')});`;
});
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${statements.join('\n')}\n`, { encoding: 'utf8' });
console.log(`Generated ${rows.length} contact rows at ${output}`);
