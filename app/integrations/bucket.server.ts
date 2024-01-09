import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface GetPresignedUrlParams {
  fileName: string;
  contentType: string;
  userId: string;
}

class BucketStorageClient {
  private s3Client: S3Client;

  constructor() {
    this.s3Client = new S3Client({
      region: "auto",
      endpoint: process.env.AWS_BUCKET_URL,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  async getPUTPresignedUrl({
    fileName,
    contentType,
    userId,
  }: GetPresignedUrlParams): Promise<{ url: string; key: string }> {
    const key = encodeURIComponent(`${Date.now()}_${fileName}`);
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      Metadata: { userId },
    });

    const url = await getSignedUrl(this.s3Client, command, { expiresIn: 300 });
    return { url, key };
  }

  async getGETPresignedUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
    });

    // Valid for 7 days
    const url = await getSignedUrl(this.s3Client, command, { expiresIn: 604_800 });
    return url;
  }
}

export const Bucket = new BucketStorageClient();
