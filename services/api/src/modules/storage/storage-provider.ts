export interface PutPrivateInput {
  objectKey: string;
  body: Buffer | Uint8Array;
  contentType: string;
}

/**
 * Everything the domain is allowed to know about object storage: put a
 * private object, mint a time-limited signed URL to read one back, or delete
 * one. Domain code only ever stores/passes an `objectKey` string - never a
 * raw URL, bucket name, or credential. No method here can make an object
 * publicly readable; `getSignedRead` is the only read path there is.
 */
export interface StorageProvider {
  putPrivate(input: PutPrivateInput): Promise<void>;
  getSignedRead(objectKey: string, expiresInSeconds?: number): Promise<string>;
  delete(objectKey: string): Promise<void>;
}
