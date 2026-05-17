import { getDatabase } from './db';
import type { CompanySettings, UpdateCompanySettingsInput } from '../../shared/types';

export function getCompanySettings(): CompanySettings {
  const db = getDatabase();
  return db
    .prepare('SELECT * FROM company_settings WHERE id = 1')
    .get() as CompanySettings;
}

export function saveCompanySettings(data: UpdateCompanySettingsInput): void {
  const db = getDatabase();
  const keys = Object.keys(data).filter((k) => k !== 'id');
  if (keys.length === 0) return;

  const fields = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(
    `UPDATE company_settings SET ${fields}, updated_at = datetime('now') WHERE id = 1`
  ).run(data);
}
