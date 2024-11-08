import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { WebhostS3 } from './common/application/webhost-s3';
import { CloudFrontWithS3 } from './common/application/cloudfront-with-s3';
import { CognitoEmail } from './common/application/cognito-email'
import { ApiLambda } from './common/application/api-lambda';
import { ISecurityGroup, IVpc } from 'aws-cdk-lib/aws-ec2';
import { LoggingS3 } from './common/datastore/logging-s3';

interface ApplicationStackProps extends StackProps {
  /**
   * Applicationを配置するVPC LambdaはこのVPC内に配置される
   */
  vpc: IVpc;

  /**
   * Lambdaに設定するセキュリティグループ
   */
  lambdaSg: ISecurityGroup,

  /**
   * CloudFrontへのアクセスを許可するIPアドレスリスト ,(カンマ)区切り
   * 指定されていない場合は、anyからのアクセスを許可
   * 
   * @example '0.0.0.0,192.168.1.0'
   */
  allowIps: string;

  /**
   * AuroraのCredentialに設定したSecretManagerのARN
   * LambdaからAuroraにアクセスするために必要
   * Lambdaの環境変数に設定する
   * 
   * @example 'arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:my-secret'
   */
  auroraSecretManagerArn: string;

  /**
   * AuroraにアクセスするためのRDS ProxyのEndpoint
   * Lambdaの環境変数に設定する
   * 
   * @example 'my-proxy.cluster-123456789012.ap-northeast-1.rds.amazonaws.com'
   */
  rdsProxyEndpoint: string;
}

/**
 * アプリケーションを作成し、ソースのdpeloymnetを行う
 * 事前に、backendディレクリでsam build、frontendディレクトリでnpm run buildを実行しておくこと
 * - Cognito
 * - API Gateway
 * - Lambda
 * - S3
 * - CloudFront
 */
export class ApplicationStack extends Stack {
  constructor(scope: Construct, id: string, props: ApplicationStackProps) {
    super(scope, id, props);

    // CloudFrontログを保存するバケットを作成
    const logBucket = new LoggingS3(this, 'LoggingBucket').loggingBucket;

    // Cognito作成
    const cognito = new CognitoEmail(this, 'CognitoEmail');

    // APIとLambdaを作成
    const apiLambda = new ApiLambda(this, 'ApiLambda',{
      userPool: cognito.userPool,
      vpc: props.vpc,
      lambdaSg: props.lambdaSg,
      auroraSecretManagerArn: props.auroraSecretManagerArn,
      rdsProxyEndpoint: props.rdsProxyEndpoint,
    });

    // フロントWebアプリケーションをホストするバケット作成
    const webhostS3 = new WebhostS3(this, 'WebHostBucket');

    // CloudFrontディストリビューション作成
    const cloudFrontWithS3 = new CloudFrontWithS3(this, 'CloudFrontWithS3', {
      s3Bucket: webhostS3.webHostBucket,
      apiGw: apiLambda.apiGw,
      allowIps: props.allowIps,
      logBucket: logBucket,
    });

    // フロントWebアプリケーションをデプロイ
    webhostS3.deploy(webhostS3.webHostBucket, cloudFrontWithS3.distribution);

    // 出力
    new CfnOutput(this, 'UserPoolId', {
      value: cognito.userPool.userPoolId,
    });

    new CfnOutput(this, 'UserPoolClientId', {
      value: cognito.userPoolClient.userPoolClientId,
    });

    new CfnOutput(this, 'IdentityPoolId', {
      value: cognito.identityPool.ref,
    });

    new CfnOutput(this, 'DistributionDomainName', {
      value: cloudFrontWithS3.distribution.domainName,
    });
  }
}
