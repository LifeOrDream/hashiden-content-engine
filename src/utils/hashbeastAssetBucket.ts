const LEGACY_DEPLOYMENT_BUCKET_RE = /api-deployments/i;

export function getHashBeastAssetBucketName(): string {
  const explicit =
    process.env.HASHBEAST_ASSETS_BUCKET ||
    process.env.ASSETS_BUCKET_NAME ||
    process.env.NFT_ASSETS_BUCKET;

  if (explicit) return explicit;

  const bucketName = process.env.BUCKET_NAME || "";
  if (LEGACY_DEPLOYMENT_BUCKET_RE.test(bucketName)) {
    // TODO(rebrand-infra): real S3 bucket, not renamed by the rebrand sweep.
    // Migrate the bucket (or add a hashiden-assets-prod alias) before flipping
    // this literal; renaming the string alone would break asset resolution.
    return "hashiden-assets-prod";
  }

  return bucketName;
}
