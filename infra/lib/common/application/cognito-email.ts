import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * サインインにメールアドレスを使用するCognitoユーザープールを作成する
 * 
 * - UserPool
 * - UserPoolClient
 * - IdentityPool
 */
export class CognitoEmail extends Construct {
  /**
   * 作成されたユーザープール
   */
  public readonly userPool: cognito.IUserPool;
  /**
   * 作成されたユーザープールクライアント
   */
  public readonly userPoolClient: cognito.IUserPoolClient;
  /**
   * 作成されたIDプール
   */
  public readonly identityPool: cognito.CfnIdentityPool;
  
  constructor(scope: Construct, id: string) {
    super(scope, id);
    // ユーザープールの作成
    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true, // ユーザーの自己登録を許可
      signInAliases: {
        email: true, // メールアドレスをログインに使用
      },
      autoVerify: {
        email: true, // メールアドレスの自動検証
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: false, // メールアドレスの変更を禁止
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false, // 記号の使用は任意
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY, // メールでのリカバリを有効化
    });

    // ユーザープールクライアントの作成
    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      generateSecret: false, // クライアントシークレットの無効化（通常は不要）
    });

    // IDプールの作成
    const identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      allowUnauthenticatedIdentities: false, // 認証されていないアクセスを無効化
      cognitoIdentityProviders: [
        {
          clientId: userPoolClient.userPoolClientId,
          providerName: userPool.userPoolProviderName,
        },
      ],
    });

    // 認証済みユーザーのためのIAMロールの作成
    const authenticatedRole = new iam.Role(this, 'CognitoAuthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
    });

    // IDプールの認証済みIAMロールの関連付け
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
      },
    });

    // プロパティの設定
    this.userPool = userPool;
    this.userPoolClient = userPoolClient;
    this.identityPool = identityPool;
  }
}
