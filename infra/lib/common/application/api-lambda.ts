import { StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Function, Code, Runtime, Tracing, Architecture } from 'aws-cdk-lib/aws-lambda';
import { CognitoUserPoolsAuthorizer, RestApi, LambdaIntegration, LogGroupLogDestination, AccessLogFormat, CfnAccount } from 'aws-cdk-lib/aws-apigateway';
import { IUserPool } from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { IVpc, SubnetType, ISecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { PolicyStatement, Effect, AnyPrincipal, PolicyDocument } from 'aws-cdk-lib/aws-iam';


interface ApiLambdaProps extends StackProps {
  /**
   * ユーザ認証用のCognitoユーザープール
   */
  userPool: IUserPool;

  /**
   * Applicationを配置するVPC LambdaはこのVPC内に配置される
   */
  vpc: IVpc;

  /**
   * Lambda関数用のセキュリティグループ
   */
  lambdaSg: ISecurityGroup;

  /**
   * LambdaからアクセスするAuroraのSecrets ManagerのARN
   * Lambdaの環境変数に設定する
   * 
   * @example 'arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:my-secret'
   */
  auroraSecretManagerArn: string;

  /**
   * LambdaからアクセスするAuroraのRDS Proxyのエンドポイント
   * Lambdaの環境変数に設定する
   * 
   * @example 'my-proxy.cluster-123456789012.ap-northeast-1.rds.amazonaws.com'
   */
  rdsProxyEndpoint: string;
}

/**
 * アプリケーション用のAPI GatewayとLambdaを作成する
 * 
 * - API Gateway
 * - Lambda Private Subnetに配置
 */
export class ApiLambda extends Construct {
  /**
   * 作成されたAPI Gatewayのオブジェクト
   */
  public readonly apiGw: RestApi;

  constructor(scope: Construct, id: string, props: ApiLambdaProps) {
    super(scope, id);

    // vpcを取得
    const vpc = props.vpc;

    // Subnets
    const vpcSubnets = vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_WITH_EGRESS })

    // Lambda関数の作成
    const mainFunction = new Function(this, 'MainFunction', {
      code: Code.fromAsset('../backend/.aws-sam/build/MainFunction'), // Lambda関数のコードパス
      handler: 'app.lambdaHandler', // ハンドラーの指定
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.X86_64,
      timeout: Duration.seconds(10), // タイムアウトの設定
      tracing: Tracing.ACTIVE, // トレーシングを有効化
      vpc: vpc,
      vpcSubnets: vpcSubnets,
      securityGroups: [props.lambdaSg],
      environment: { // 環境変数の設定
        RDS_PROXY_ENDPOINT: props.rdsProxyEndpoint,
        ENV_NAME: 'production',
        SECRET_MANAGER_ARN: props.auroraSecretManagerArn, // Secrets ManagerのARN
      }
    });

    // Secrets Managerのアクセス権限を追加
    mainFunction.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue'],
      resources: [props.auroraSecretManagerArn],
    }));

    // Cognitoユーザープールの参照
    const userPool = props.userPool;

    // API GatewayのCognitoオーソライザー
    const authorizer = new CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
    });

    // API Gateway用のロググループ
    const apiLogGroup = new LogGroup(this, 'ApiGatewayLogGroup', {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY, // 開発環境用のため削除許可
    });

    // API Gatewayの作成
    this.apiGw = new RestApi(this, 'ApiGatewayApi', {
      restApiName: 'MainAPI',
      cloudWatchRole: true, // CloudWatch Logsのロールを自動作成
      deployOptions: {
        stageName: 'api',
        accessLogDestination: new LogGroupLogDestination(apiLogGroup), // ログの出力先
        accessLogFormat: AccessLogFormat.clf(),
      },
      policy: new PolicyDocument({
        statements: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            principals: [new AnyPrincipal()],
            actions: ['execute-api:Invoke'],
            resources: ['execute-api:/*/*/*'],
            conditions: {
              StringEquals: {
                'aws:Referer': 'wyQUfM5bd8pcXQvcN3igAnACzSP8VCWQ',
              },
            },
          }),
        ],
      }),
    });

    // Lambda関数とAPI Gatewayの統合
    const lambdaIntegration = new LambdaIntegration(mainFunction);

    // `/hello` パスのエンドポイントを追加
    this.apiGw.root.addResource('hello').addMethod('GET', lambdaIntegration, {
      authorizer,
    });
  }
}
