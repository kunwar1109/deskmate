import { randomBytes } from 'node:crypto';
import { MAX_API_KEYS, type ApiKeySummary, type CreatedApiKey } from '@deskmate/shared/api-keys';
import { ObjectId, type WithId } from 'mongodb';
import { apiKeys, type ApiKeyRecord } from '../db.js';
import { ConflictError, HttpError } from './errors.js';
import { hashToken } from './widget.js';

const PREFIX_LENGTH = 10; // "dmk_" + 6 characters

/** "dmk_" makes a leaked key recognisable (secret scanners look for prefixes like this) and tells keys apart. */
function generateApiKey(): string {
  return `dmk_${randomBytes(32).toString('base64url')}`;
}

function toSummary(record: WithId<ApiKeyRecord>): ApiKeySummary {
  return {
    id: record._id.toString(),
    name: record.name,
    prefix: record.prefix,
    createdAt: record.createdAt.toISOString(),
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
  };
}

export async function listApiKeys(workspaceId: string): Promise<ApiKeySummary[]> {
  const records = await apiKeys.find({ workspaceId }).sort({ createdAt: -1 }).toArray();
  return records.map(toSummary);
}

/** Creates a key and returns it in full. This is the only time it exists outside the client: we keep a hash. */
export async function createApiKey(workspaceId: string, userId: string, name: string): Promise<CreatedApiKey> {
  if ((await apiKeys.countDocuments({ workspaceId })) >= MAX_API_KEYS) {
    throw new ConflictError(`A workspace can have ${MAX_API_KEYS} keys. Delete one you no longer use first.`);
  }
  const key = generateApiKey();
  const record: ApiKeyRecord = {
    workspaceId,
    name,
    prefix: key.slice(0, PREFIX_LENGTH),
    hash: hashToken(key),
    createdBy: userId,
    createdAt: new Date(),
  };
  const { insertedId } = await apiKeys.insertOne(record);
  return { ...toSummary({ ...record, _id: insertedId }), key };
}

/** Deleting is revoking: the next request with the key gets a 401. Filters by _id AND workspaceId. */
export async function deleteApiKey(workspaceId: string, id: string): Promise<void> {
  const { deletedCount } = ObjectId.isValid(id) ? await apiKeys.deleteOne({ _id: new ObjectId(id), workspaceId }) : { deletedCount: 0 };
  if (deletedCount === 0) throw new HttpError(404, 'API key not found');
}

/**
 * The workspace a presented key belongs to, or null. Looked up by the key's hash: the database never sees
 * the key, and since the hash is of 256 random bits, a lookup by hash can't be used to guess keys.
 */
export async function findApiKey(key: string): Promise<WithId<ApiKeyRecord> | null> {
  if (!key.startsWith('dmk_')) return null;
  const record = await apiKeys.findOne({ hash: hashToken(key) });
  if (record) {
    // "Last used" helps owners spot keys they can delete. Not awaited: the request shouldn't wait for it.
    void apiKeys.updateOne({ _id: record._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return record;
}
