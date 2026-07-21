import 'server-only';

export const MAGALU_API_KEY = process.env.MAGALU_API_KEY || 'c4dc989c-c97f-469a-bc86-ec91e88f3847';
export const MAGALU_API_KEY_ID = process.env.MAGALU_API_KEY_ID || '2353d7d7-99cb-4ed7-bdef-db1e57eebf41';
export const MAGALU_API_KEY_SECRET = process.env.MAGALU_API_KEY_SECRET || 'dc788f82-a2ff-4420-a195-155cb843d334';
export const MAGALU_TENANT_UUID = process.env.MAGALU_TENANT_UUID || '5f50aa35-dd25-467d-a965-405ea25d6630';
export const MAGALU_API_ENDPOINT = 'https://api.magazineluiza.com.br/v1';

export function getMagaluHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': MAGALU_API_KEY,
    'x-api-key-id': MAGALU_API_KEY_ID,
    'x-api-key-secret': MAGALU_API_KEY_SECRET,
    'x-tenant-uuid': MAGALU_TENANT_UUID,
    'User-Agent': 'EspacoGeek86-Scraper/1.0',
  };
}
