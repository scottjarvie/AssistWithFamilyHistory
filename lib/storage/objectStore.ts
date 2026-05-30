// lib/storage/objectStore.ts
//
// Self-hosted media storage on Backblaze B2 via the S3-compatible API.
//
// Why B2: storage is ~$0.006/GB and egress is FREE once we put Cloudflare in
// front (the Bandwidth Alliance), so hosting cost stays flat regardless of
// traffic. We start by serving B2-direct (metered egress, fine at low volume)
// and cut over to Cloudflare later by changing ONE env var (CDN_PUBLIC_BASE) —
// no re-upload required, because we store the full public URL on the record.
//
// Env (server-only — never NEXT_PUBLIC; these are secrets / infra config):
//   B2_KEY_ID            keyID of the bucket-scoped application key
//   B2_APPLICATION_KEY   applicationKey (secret)
//   B2_BUCKET            bucket name, e.g. discover-their-stories-media
//   B2_ENDPOINT          https://s3.us-west-004.backblazeb2.com
//   B2_REGION            us-west-004 (the cluster part of the endpoint)
//   CDN_PUBLIC_BASE      public serving base; B2-direct now, Cloudflare later
//                        e.g. https://f004.backblazeb2.com/file/discover-their-stories-media
//
// The AWS SDK is imported lazily so this module is safe to import from code
// paths (client bundles, edge) that never actually upload.

import type { S3Client as S3ClientType } from "@aws-sdk/client-s3";

export interface B2Config {
  keyId: string;
  applicationKey: string;
  bucket: string;
  endpoint: string;
  region: string;
  /** Public serving base with no trailing slash. */
  publicBase: string;
}

/**
 * Read + validate B2 config from the environment. Returns null (rather than
 * throwing) when storage isn't configured, so callers can cleanly fall back to
 * existing URLs / local storage in dev.
 */
export function getB2Config(): B2Config | null {
  const keyId = process.env.B2_KEY_ID;
  const applicationKey = process.env.B2_APPLICATION_KEY;
  const bucket = process.env.B2_BUCKET;
  const endpoint = process.env.B2_ENDPOINT;
  const region = process.env.B2_REGION || "us-west-004";
  const publicBase = process.env.CDN_PUBLIC_BASE;

  if (!keyId || !applicationKey || !bucket || !endpoint || !publicBase) {
    return null;
  }
  return {
    keyId,
    applicationKey,
    bucket,
    endpoint,
    region,
    publicBase: publicBase.replace(/\/+$/, ""),
  };
}

/** True when all required B2 env vars are present. */
export function isB2Configured(): boolean {
  return getB2Config() !== null;
}

let cachedClient: S3ClientType | null = null;

async function getClient(cfg: B2Config): Promise<S3ClientType> {
  if (cachedClient) return cachedClient;
  const { S3Client } = await import("@aws-sdk/client-s3");
  cachedClient = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.keyId,
      secretAccessKey: cfg.applicationKey,
    },
    // B2 requires path-style addressing (bucket in the path, not the host).
    forcePathStyle: true,
    // ⚠️ Hard-won gotcha: AWS SDK v3 (>= 3.729) sends default "flexible"
    // checksum headers (x-amz-checksum-crc32 / x-amz-sdk-checksum-algorithm)
    // that B2 rejects with an "Unsupported header" error, silently breaking the
    // first PUT. Forcing WHEN_REQUIRED disables them unless a command needs one.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return cachedClient;
}

/** Build the public URL for a stored object key (served via CDN_PUBLIC_BASE). */
export function publicUrlForKey(key: string): string {
  const cfg = getB2Config();
  const base = cfg?.publicBase ?? (process.env.CDN_PUBLIC_BASE || "").replace(/\/+$/, "");
  return `${base}/${key.replace(/^\/+/, "")}`;
}

export interface UploadResult {
  /** The object key it was stored under (deterministic; overwrite-safe). */
  key: string;
  /** The public URL to store on the record and serve to clients. */
  url: string;
}

/**
 * PUT bytes to B2 and return the key + public URL.
 *
 * Keys should be deterministic (no random suffix) so re-uploads are idempotent.
 * A public bucket needs no ACL header — public-read comes from the bucket
 * setting and B2 ignores per-object ACLs.
 */
export async function uploadToB2(opts: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  /** Defaults to a 1-year immutable cache (good for content-addressed keys). */
  cacheControl?: string;
}): Promise<UploadResult> {
  const cfg = getB2Config();
  if (!cfg) {
    throw new Error(
      "B2 is not configured: set B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET, B2_ENDPOINT and CDN_PUBLIC_BASE.",
    );
  }
  const key = opts.key.replace(/^\/+/, "");
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getClient(cfg);
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: opts.body,
      ContentType: opts.contentType,
      CacheControl: opts.cacheControl ?? "public, max-age=31536000, immutable",
    }),
  );
  return { key, url: `${cfg.publicBase}/${key}` };
}

/** Delete an object by key. No-op-safe if B2 isn't configured. */
export async function deleteFromB2(key: string): Promise<void> {
  const cfg = getB2Config();
  if (!cfg) return;
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getClient(cfg);
  await client.send(
    new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key.replace(/^\/+/, "") }),
  );
}
