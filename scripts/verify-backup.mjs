import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

export async function verifyBackup(directory) {
  const manifest = await readJson(path.join(directory, 'manifest.json'));
  const dataPath = path.join(directory, 'data.json');
  const dataBody = await fs.readFile(dataPath, 'utf8');
  const data = JSON.parse(dataBody);

  if (manifest.backup_format !== 'casajoy-d1-manifest' || manifest.backup_format_version !== 2) {
    throw new Error('Unsupported backup manifest format.');
  }
  if (data.backup_format !== 'casajoy-d1-data' || data.backup_format_version !== 2) {
    throw new Error('Unsupported backup data format.');
  }
  if (!manifest.backup_id || manifest.backup_id !== data.backup_id) {
    throw new Error('Manifest and data backup IDs do not match.');
  }
  if (manifest.checksums?.data_sha256 !== sha256Hex(dataBody)) {
    throw new Error('The data checksum does not match the manifest.');
  }
  const inventory = manifest.scan_inventory || [];
  if (manifest.checksums?.scan_inventory_sha256 !== sha256Hex(canonicalJson(inventory))) {
    throw new Error('The scan inventory checksum does not match the manifest.');
  }
  if (manifest.objects?.data?.bytes !== Buffer.byteLength(dataBody, 'utf8')) {
    throw new Error('The data byte count does not match the manifest.');
  }

  const tables = data.tables || {};
  const expectedTables = ['contacts', 'edit_history', 'editor_users', 'auth_audit'];
  for (const table of expectedTables) {
    if (!Array.isArray(tables[table])) throw new Error(`Missing backup table: ${table}`);
    const expectedCount = table === 'editor_users'
      ? manifest.table_counts?.editor_users_metadata
      : manifest.table_counts?.[table];
    if (tables[table].length !== expectedCount) throw new Error(`Table count mismatch: ${table}`);
  }
  if (Object.hasOwn(tables, 'editor_sessions') || Object.hasOwn(tables, 'login_attempts')) {
    throw new Error('Transient authentication tables must not be present in backup data.');
  }
  for (const user of tables.editor_users) {
    if (Object.hasOwn(user, 'password_salt') || Object.hasOwn(user, 'password_hash')) {
      throw new Error('Password material must not be present in backup data.');
    }
  }

  return { backupId: manifest.backup_id, tableCounts: manifest.table_counts, scanCount: inventory.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2];
  if (!directory) {
    console.error('Usage: npm run backup:verify -- <private-backup-directory>');
    process.exitCode = 2;
  } else {
    try {
      await verifyBackup(path.resolve(directory));
      console.log('Backup verification passed.');
    } catch (error) {
      console.error(`Backup verification failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
