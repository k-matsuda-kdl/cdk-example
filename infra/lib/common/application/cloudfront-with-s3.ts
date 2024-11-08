import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfront_origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Bucket, IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { RestApi } from 'aws-cdk-lib/aws-apigateway';

interface CloudFrontWithS3Props {
  /**
   * CloudFrontのオリジンに指定するWebホスティング用のS3バケット
   */
  s3Bucket: Bucket;
  /**
   * CloudFrontのオリジンに指定するAPI Gateway
   */
  apiGw: RestApi;
  /**
   * CloudFrontへのアクセスを許可するIPアドレスリスト ,(カンマ)区切り
   * 指定されていない場合は、anyからのアクセスを許可
   * 
   * @example '0.0.0.0,192.168.1.0'
   */
  allowIps: string;

  /**
   * CloudFrontのログを保存するS3バケット
   */
  logBucket: IBucket;
}

/**
 * CloudFrontとS3を組み合わせたWebホスティング環境を構築する
 * 
 * - CloudFront
 * - CloudFront Function
 */
export class CloudFrontWithS3 extends Construct {
  /**
   * 作成されたCloudFrontディストリビューションのオブジェクト
   */
  public readonly distribution: cloudfront.Distribution;
  constructor(scope: Construct, id: string, props: CloudFrontWithS3Props) {
    super(scope, id);

    // Webホスティング用のS3バケット
    const websiteBucket = props.s3Bucket;

    // CloudFrontのレスポンスヘッダをカスタマイズ
    const customHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'ResponseHeadersPolicy', {
      responseHeadersPolicyName: 'SecurityHeadersPolicy',
      comment: 'Add security headers to CloudFront responses',
      customHeadersBehavior: {
        customHeaders: [
          { header: 'X-Robots-Tag', value: 'noindex, nofollow', override: false },
        ],
      },
      securityHeadersBehavior: {
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: false },
        strictTransportSecurity: { accessControlMaxAge: cdk.Duration.seconds(31536000), includeSubdomains: false, override: false },
        xssProtection: { protection: true, modeBlock: false, override: false },
      },
    });

    // IP制限のCloudFront Functionを作成
    const functionAssociations: cloudfront.FunctionAssociation[] = [];
    if (props.allowIps) {
      const ipWhitelist = props.allowIps
        .split(',')
        .map(ip => ip.trim());  // /で分割し、IPアドレス部分のみ取得
      const ipRestrictionFunction = this.createCloudFrontFunction(ipWhitelist);
      functionAssociations.push({
        function: ipRestrictionFunction,
        eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
      });
    }

    // APIGwのオリジンを作成
    const apiOrigin = new cloudfront_origins.RestApiOrigin(props.apiGw, {
      customHeaders: {
        Referer: 'wyQUfM5bd8pcXQvcN3igAnACzSP8VCWQ', // カスタムRefererヘッダーを設定
      },
      originPath: '',
    });

    // CloudFrontディストリビューションの作成
    this.distribution = new cloudfront.Distribution(this, 'WebsiteDistribution', {
      defaultBehavior: {
        origin: cloudfront_origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: customHeadersPolicy,
        functionAssociations
      },
      additionalBehaviors: {
        '/api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED, // APIはキャッシュしない設定
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          functionAssociations
        },
      },
      // 標準ログを設定
      enableLogging: true,
      logBucket: props.logBucket,
      logFilePrefix: 'cloudfront-logs/',
      logIncludesCookies: true,
      // デフォルトのルートオブジェクトを設定
      defaultRootObject: 'index.html',
    });
  }

  // CloudFront Functionの作成 (IPアドレス制限のロジックを追加)
  private createCloudFrontFunction(ipWhitelist: Array<string>): cloudfront.Function {
    return new cloudfront.Function(this, 'IPRestrictionFunction', {
      code: cloudfront.FunctionCode.fromInline(`
        function handler(event) {
          var request = event.request;
          var clientIP = event.viewer.ip;
          // アクセス許可するIPを設定
          var IP_WHITE_LIST = ${JSON.stringify(ipWhitelist)};
          // クライアントIPが、アクセス許可するIPに含まれていればtrueを返す
          var isPermittedIp = IP_WHITE_LIST.includes(clientIP);

          if (isPermittedIp) {
            // trueの場合はオリジン側へリクエストを渡す
            return request;
          } else {
            var response = {
                statusCode: 403,
                statusDescription: 'Forbidden',
            }

            // falseの場合はViewer に対してレスポンスを返す
            return response;
          }
        }
      `),
    });
  }
}
