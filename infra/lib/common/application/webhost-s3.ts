import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Distribution } from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';

/**
 * Webホスティング用のS3バケットを作成する
 * 
 * - Bucket Webホスティング用
 */
export class WebhostS3 extends Construct {
  /**
   * 作成されたWebホスティング用のS3バケットのオブジェクト
   */
  public readonly webHostBucket: s3.Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    // S3バケットの作成
    this.webHostBucket = new s3.Bucket(this, 'WebHostBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,  // 全てのパブリックアクセスをブロック
      websiteIndexDocument: 'index.html',
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 削除時にバケットを削除
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED, // S3管理型暗号化
    });
  }

  /**
   * Bucketにファイルをデプロイする
   * 
   * @param webHostBucket - アップロードするS3バケット
   * @param distribution - CloudFrontのディストリビューション
   */
  deploy(webHostBucket: s3.Bucket, distribution: Distribution): void {
    // デプロイ用のS3バケットへのファイルアップロード
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset('../front/dist')],
      destinationBucket: webHostBucket,
      distribution,
      distributionPaths: ['/*'],
    });
  }
}
