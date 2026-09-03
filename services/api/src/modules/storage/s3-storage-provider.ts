import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PutPrivateInput, StorageProvider } from './storage-provider';

export interface S3StorageProviderOptions {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  /** MinIO and most self-hosted S3-compatible services need path-style URLs. */
  forcePathStyle?: boolean;
  /**
   * AWS SDK v3 defaults to 3 attempts with backoff, which turns a simple
   * "is this endpoint even up" check into a slow, multi-second failure.
   * Defaults to 3 for normal resilience; pass 1 for a fast-failing
   * availability probe.
   */
  maxAttempts?: number;
}

/**
 * Real object storage over the S3 API. Works unchanged against MinIO
 * (local/dev, via docker-compose.yml's object-storage service) or a real
 * S3-compatible provider in production - only the constructor options
 * differ, never application code.
 */
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3StorageProviderOptions) {
    this.bucket = options.bucket;
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region ?? 'us-east-1',
      forcePathStyle: options.forcePathStyle ?? true,
      maxAttempts: options.maxAttempts ?? 3,
      requestHandler: { connectionTimeout: 2000, requestTimeout: 5000 },
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async putPrivate({ objectKey, body, contentType }: PutPrivateInput): Promise<void> {
    // No ACL is set here, intentionally: the bucket itself is provisioned
    // private (docker-compose.yml) and we never rely on a per-object ACL
    // grant to keep an object from becoming public.
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
      })
    );
  }

  async getSignedRead(objectKey: string, expiresInSeconds = 300): Promise<string> {
    // Confirms the object actually exists before minting a URL, so a typo'd
    // or deleted key fails clearly here instead of producing a dead link.
    await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));

    const command = new GetObjectCommand({ Bucket: this.bucket, Key: objectKey });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async delete(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }
}
