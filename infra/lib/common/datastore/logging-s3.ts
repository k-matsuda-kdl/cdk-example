import { RemovalPolicy } from 'aws-cdk-lib';
import { Bucket, BucketEncryption, BlockPublicAccess, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * CloudFrontのアクセスログを保存するS3バケットを作成する
 * 
 * - Bucket CloudFrontのアクセスログ用
 */
export class LoggingS3 extends Construct {
  /**
   * 作成されたログ保管用のS3バケットのオブジェクト
   * objectOwnershipがBUCKET_OWNER_PREFERREDに設定されていることに注意
   */
  public readonly loggingBucket: Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.loggingBucket = new Bucket(this, 'LoggingBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,  // 全てのパブリックアクセスをブロック
      removalPolicy: RemovalPolicy.DESTROY, // 開発用として削除を許可する
      encryption: BucketEncryption.S3_MANAGED, // S3管理型暗号化
      objectOwnership: ObjectOwnership.BUCKET_OWNER_PREFERRED, // CloudFrontログ用のACL有効化
    });
  }
}
