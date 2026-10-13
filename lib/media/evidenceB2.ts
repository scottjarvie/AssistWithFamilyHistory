import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "node:crypto";
import {
  EVIDENCE_UPLOAD_TTL_SECONDS,
  remainingEvidenceUploadTtl,
} from "./evidenceStandard";

export type EvidenceBucketClass = "private" | "public";

export type EvidenceB2Config = {
  endpoint: string;
  region: string;
  bucket: string;
  keyId: string;
  applicationKey: string;
  environment: "development" | "preview" | "production";
  bucketClass: EvidenceBucketClass;
};

function required(name: string, value: string | undefined): string {
  if (!value?.trim()) throw new Error(`Media storage is not configured: ${name} is missing.`);
  return value.trim();
}

/** Load one of the only two provider boundaries this project permits. */
export function loadEvidenceB2Config(bucketClass: EvidenceBucketClass): EvidenceB2Config {
  const prefix = bucketClass === "private" ? "B2_PRIVATE" : "B2_PUBLIC";
  const environment = required("MEDIA_STORAGE_ENVIRONMENT", process.env.MEDIA_STORAGE_ENVIRONMENT);
  if (!(["development", "preview", "production"] as const).includes(environment as never)) {
    throw new Error("MEDIA_STORAGE_ENVIRONMENT must be development, preview, or production.");
  }
  return {
    endpoint: required(`${prefix}_ENDPOINT`, process.env[`${prefix}_ENDPOINT`]),
    region: required(`${prefix}_REGION`, process.env[`${prefix}_REGION`]),
    bucket: required(`${prefix}_BUCKET`, process.env[`${prefix}_BUCKET`]),
    keyId: required(`${prefix}_KEY_ID`, process.env[`${prefix}_KEY_ID`]),
    applicationKey: required(`${prefix}_APPLICATION_KEY`, process.env[`${prefix}_APPLICATION_KEY`]),
    environment: environment as EvidenceB2Config["environment"],
    bucketClass,
  };
}

export function assertEvidenceBucketSeparation(
  privateConfig: Pick<EvidenceB2Config, "bucket" | "endpoint">,
  publicConfig: Pick<EvidenceB2Config, "bucket" | "endpoint">,
): void {
  if (privateConfig.bucket === publicConfig.bucket && privateConfig.endpoint === publicConfig.endpoint) {
    throw new Error("Private and public family evidence must use different B2 buckets.");
  }
}

export function evidenceB2ClientConfig(config: EvidenceB2Config): S3ClientConfig {
  return {
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: false,
    credentials: { accessKeyId: config.keyId, secretAccessKey: config.applicationKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  };
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function isEvidenceB2AccessDenied(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: unknown;
    Code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  const status = candidate.$metadata?.httpStatusCode;
  const code = typeof candidate.Code === "string" ? candidate.Code : candidate.name;
  return status === 401 || status === 403 || code === "AccessDenied" || code === "Unauthorized";
}

export function assertRelayCompatibleSignature(url: string): void {
  const parsed = new URL(url);
  const signedHeaders = (parsed.searchParams.get("X-Amz-SignedHeaders") ?? "").toLowerCase();
  if (
    signedHeaders.includes("x-amz-checksum-")
    || [...parsed.searchParams.keys()].some((name) => name.toLowerCase().startsWith("x-amz-checksum-"))
  ) throw new Error("B2 upload URL unexpectedly requires an SDK checksum header.");
}

export type EvidenceB2Head = {
  versionId: string;
  sizeBytes: number;
  contentType: string;
};

export class EvidenceB2Store {
  readonly client: S3Client;

  constructor(readonly config: EvidenceB2Config, client?: S3Client) {
    this.client = client ?? new S3Client(evidenceB2ClientConfig(config));
  }

  async signPut(input: {
    objectKey: string;
    contentType: string;
    contentLength: number;
    expiresAt?: number;
  }): Promise<string> {
    const expiresIn = input.expiresAt
      ? remainingEvidenceUploadTtl(input.expiresAt)
      : EVIDENCE_UPLOAD_TTL_SECONDS;
    const url = await getSignedUrl(this.client, new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    }), { expiresIn });
    assertRelayCompatibleSignature(url);
    return url;
  }

  /** Open a multipart upload for an original too large for one relay request. */
  async createMultipart(input: { objectKey: string; contentType: string }): Promise<string> {
    const result = await this.client.send(new CreateMultipartUploadCommand({
      Bucket: this.config.bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
      CacheControl: "private, no-store",
    }));
    if (!result.UploadId) throw new Error("B2 did not return a multipart upload id.");
    return result.UploadId;
  }

  async signUploadPart(input: {
    objectKey: string;
    uploadId: string;
    partNumber: number;
    contentLength: number;
    expiresAt?: number;
  }): Promise<string> {
    const expiresIn = input.expiresAt
      ? remainingEvidenceUploadTtl(input.expiresAt)
      : EVIDENCE_UPLOAD_TTL_SECONDS;
    const url = await getSignedUrl(this.client, new UploadPartCommand({
      Bucket: this.config.bucket,
      Key: input.objectKey,
      UploadId: input.uploadId,
      PartNumber: input.partNumber,
      ContentLength: input.contentLength,
    }), { expiresIn });
    assertRelayCompatibleSignature(url);
    return url;
  }

  async completeMultipart(input: {
    objectKey: string;
    uploadId: string;
    parts: Array<{ partNumber: number; etag: string }>;
  }): Promise<void> {
    await this.client.send(new CompleteMultipartUploadCommand({
      Bucket: this.config.bucket,
      Key: input.objectKey,
      UploadId: input.uploadId,
      MultipartUpload: {
        Parts: [...input.parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
      },
    }));
  }

  async abortMultipart(objectKey: string, uploadId: string): Promise<void> {
    await this.client.send(new AbortMultipartUploadCommand({
      Bucket: this.config.bucket,
      Key: objectKey,
      UploadId: uploadId,
    }));
  }

  /**
   * Hash an exact version as it streams, keeping only its first bytes for type
   * sniffing, so a whole scanned book never has to sit in memory.
   */
  async digest(objectKey: string, versionId: string, keepBytes = 64 * 1024): Promise<{
    sha256: string;
    sizeBytes: number;
    head: Uint8Array;
  }> {
    const result = await this.client.send(new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: objectKey,
      VersionId: versionId,
    }));
    if (!result.Body) throw new Error("B2 returned no evidence bytes.");
    const hash = createHash("sha256");
    const head = new Uint8Array(keepBytes);
    let kept = 0;
    let sizeBytes = 0;
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
      hash.update(chunk);
      if (kept < keepBytes) {
        const take = Math.min(keepBytes - kept, chunk.byteLength);
        head.set(chunk.subarray(0, take), kept);
        kept += take;
      }
      sizeBytes += chunk.byteLength;
    }
    return { sha256: hash.digest("hex"), sizeBytes, head: head.subarray(0, kept) };
  }

  async head(objectKey: string, versionId?: string): Promise<EvidenceB2Head> {
    const result = await this.client.send(new HeadObjectCommand({
      Bucket: this.config.bucket,
      Key: objectKey,
      VersionId: versionId,
    }));
    if (!result.VersionId || typeof result.ContentLength !== "number") {
      throw new Error("B2 did not return an exact object version and length.");
    }
    return {
      versionId: result.VersionId,
      sizeBytes: result.ContentLength,
      contentType: result.ContentType ?? "application/octet-stream",
    };
  }

  async read(objectKey: string, versionId: string): Promise<Uint8Array> {
    const result = await this.client.send(new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: objectKey,
      VersionId: versionId,
    }));
    if (!result.Body) throw new Error("B2 returned no evidence bytes.");
    return await result.Body.transformToByteArray();
  }

  async signGet(objectKey: string, versionId: string, expiresIn = 5 * 60): Promise<string> {
    if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 5 * 60) {
      throw new Error("Evidence view capability exceeds its five-minute ceiling.");
    }
    return await getSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: objectKey,
      VersionId: versionId,
    }), { expiresIn });
  }

  async put(input: {
    objectKey: string;
    bytes: Uint8Array;
    contentType: string;
  }): Promise<{ versionId: string; sha256: string }> {
    const result = await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: input.objectKey,
      Body: input.bytes,
      ContentType: input.contentType,
      CacheControl: "private, no-store",
    }));
    if (!result.VersionId) throw new Error("B2 did not return the rendition's exact version.");
    return { versionId: result.VersionId, sha256: sha256Hex(input.bytes) };
  }

  async deleteVersion(objectKey: string, versionId: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: objectKey,
      VersionId: versionId,
    }));
  }

  async countVersionEntries(prefix: string): Promise<number> {
    let count = 0;
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    do {
      const page = await this.client.send(new ListObjectVersionsCommand({
        Bucket: this.config.bucket,
        Prefix: prefix,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      }));
      count += [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]
        .filter((entry) => entry.Key?.startsWith(prefix) && entry.VersionId)
        .length;
      keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
      versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
    } while (keyMarker !== undefined || versionIdMarker !== undefined);
    return count;
  }

  async deleteAllVersions(objectKey: string): Promise<void> {
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    do {
      const page = await this.client.send(new ListObjectVersionsCommand({
        Bucket: this.config.bucket,
        Prefix: objectKey,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      }));
      const exact = [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]
        .filter((entry) => entry.Key === objectKey && entry.VersionId);
      await Promise.all(exact.map((entry) => this.deleteVersion(objectKey, entry.VersionId!)));
      keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
      versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
    } while (keyMarker);
  }

  async deleteVersionsExcept(objectKey: string, keepVersionId: string): Promise<void> {
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    do {
      const page = await this.client.send(new ListObjectVersionsCommand({
        Bucket: this.config.bucket,
        Prefix: objectKey,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      }));
      const extra = [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]
        .filter((entry) => entry.Key === objectKey && entry.VersionId && entry.VersionId !== keepVersionId);
      await Promise.all(extra.map((entry) => this.deleteVersion(objectKey, entry.VersionId!)));
      keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
      versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
    } while (keyMarker);
  }
}
