import {
  StackProps,
  Duration,
  RemovalPolicy,
  CfnOutput,
} from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface AuroraProps extends StackProps {
  /**
   * RDSを配置するVPC
   */
  readonly vpc: ec2.IVpc;

  /**
   * RDSにアクセスを許可するセキュリティグループリスト
   */
  readonly allowSgs: ec2.ISecurityGroup[];

  /**
   * 最初のデータベース名
   */
  readonly dbName: string;

  /**
   * Auroraのエンジンバージョン
   * 
   * @example rds.AuroraMysqlEngineVersion.VER_3_05_2
   * @default rds.AuroraMysqlEngineVersion.VER_3_05_2
   */
  readonly engineVersion?: any;

  /**
   * インスタンスタイプ デフォルトはt4g.medium
   * 
   * @example ec2.InstanceType.of(
   *   ec2.InstanceClass.BURSTABLE4_GRAVITON,
   *   ec2.InstanceSize.MEDIUM,
   * )
   * @default ec2.InstanceType.of(
   *   ec2.InstanceClass.BURSTABLE4_GRAVITON,
   *   ec2.InstanceSize.MEDIUM,
   * )
   */
  readonly instanceType?: any;

  /**
   * リードレプリカの数 デフォルトは1
   * 
   * @example 2
   * @default 1
   */
  readonly replicaInstances?: number;

  /**
   * Auroraのクラスターユーザー名
   * 
   * @example 'homepage'
   * @default 'homepage'
   */
  readonly auroraClusterUsername?: string;

  /**
   * バックアップの保持期間 デフォルトは7日
   * 
   * @example 14
   * @default 7
   */
  readonly backupRetentionDays?: number;

  /**
   * バックアップを実行することが好ましい 24 時間 UTC 形式の毎日の時間範囲
   * 
   * @example '18:00-19:00'
   * @default '18:00-19:00'
   */
  readonly backupWindow?: string;

  /**
   * 優先メンテナンス時間
   * 
   * @example 'Sun:19:00-Sun:22:00'
   * @default 'Sun:19:00-Sun:22:00'
   */
  readonly preferredMaintenanceWindow?: string;
}

/**
 * Aurora MySQLを作成する
 * 
 * - Aurora MySQL
 * - RDS Proxy Endpoinはアウトプットする
 * - SecretManager Arnはアウトプットする
 */
export class AuroraMySQL extends Construct {

  /**
   * 作成されたAurora Clusterのオブジェクト
   */
  public readonly auroraCluster: rds.DatabaseCluster;

  constructor(scope: Construct, id: string, props: AuroraProps) {
    super(scope, id);

    // default database username
    let auroraClusterUsername = "homepage";
    if (typeof props.auroraClusterUsername !== 'undefined') {
      auroraClusterUsername = props.auroraClusterUsername;
    }
    // AuroraMySQLのエンジンバージョン
    let engineVersion = rds.AuroraMysqlEngineVersion.VER_3_05_2;
    if (typeof props.engineVersion !== 'undefined') {
      engineVersion = props.engineVersion;
    }
    const auroraEngine = rds.DatabaseClusterEngine.auroraMysql({
      version: engineVersion,
    });

    // VPCはパラメータから取得する
    const vpc = props.vpc;

    // Subnetsを選択する
    const vpcSubnets = vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED })
    // RDS Proxy用セキュリティグループを作る
    const tcp3306 = ec2.Port.tcp(3306);
    const rdsProxySg = new ec2.SecurityGroup(this, 'RDSProxySecurityGroup', {
      vpc: vpc,
      allowAllOutbound: false,
      description: 'RdsProxySg',
    });

    // RDS用セキュリティグループを作る
    const rdsSg = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc: vpc,
      allowAllOutbound: false,
      description: 'RDSSg',
    });
    // rdsSgとrdsProxySgにallowSgsを許可
    for (const sg of props.allowSgs) {
      rdsSg.addIngressRule(sg, tcp3306);
      rdsProxySg.addIngressRule(sg, tcp3306);
    }
    // rdsProxySgにEgressにrdsSgを追加
    rdsProxySg.addEgressRule(rdsSg, tcp3306);

    // シークレットを作成する
    const secretManager = new secretsmanager.Secret(this, 'AuroraClusterCredentials',
      {
        secretName: props.dbName + 'AuroraClusterCredentials',
        description: props.dbName + 'AuroraClusterCrendetials',
        generateSecretString: {
          excludeCharacters: "\"@/\\ '",
          generateStringKey: 'password',
          passwordLength: 30,
          secretStringTemplate: JSON.stringify({ username: auroraClusterUsername }),
        },
      },
    );
    // SecretManagerのArnのエクスポート
    new CfnOutput(this, 'SecretManagerArnExport', {
      value: secretManager.secretArn,
      exportName: 'auroraSecretManagerArn',
    });

    // aurora credentials
    const auroraClusterCrendentials = rds.Credentials.fromSecret(
      secretManager,
      auroraClusterUsername,
    );

    // Auroraのパラメータグループを作成する
    let auroraParameters: any = {};
    const auroraParameterGroup = new rds.ParameterGroup(
      this,
      'AuroraParameterGroup',
      {
        engine: auroraEngine,
        description: id + ' Parameter Group',
        parameters: auroraParameters,
      },
    );

    // インスタンスタイプを取得する
    let instanceType = props.instanceType;
    if (instanceType == null || instanceType == undefined) {
      instanceType = ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE4_GRAVITON,
        ec2.InstanceSize.MEDIUM,
      );
    }

    // CloudWatchへのログエクスポート
    const cloudwatchLogsExports = ['error', 'general', 'slowquery'];

    // バックアップを実行することが好ましい 24 時間 UTC 形式の毎日の時間範囲
    const backupWindow = props.backupWindow ?? '18:00-19:00';

    // バックアップの保持期間
    let backupRetentionDays = props.backupRetentionDays ?? 7;
    if (backupRetentionDays < 14) {
      backupRetentionDays = 14;
    }

    // レプリカの数
    let replicaInstances = props.replicaInstances ?? 1;
    if (replicaInstances < 1) {
      replicaInstances = 1;
    }

    // 優先メンテナンス時間
    let preferredMaintenanceWindow = props.preferredMaintenanceWindow ?? 'Sun:19:00-Sun:22:00';

    // writer instance
    const writerInstance = rds.ClusterInstance.provisioned("Instance1", {
      instanceType: instanceType,
      allowMajorVersionUpgrade: false,
      autoMinorVersionUpgrade: true,
      enablePerformanceInsights: true,
      performanceInsightRetention:
        rds.PerformanceInsightRetention.DEFAULT,
      publiclyAccessible: false,
      instanceIdentifier: 'Instance1',
    });
    const readerInstances = Array.from({ length: replicaInstances }, (_, i) =>
      rds.ClusterInstance.provisioned(`ReaderInstance${i + 2}`, {
        instanceIdentifier: `Instance${i + 2}`,
        instanceType: instanceType,
        allowMajorVersionUpgrade: false,
        autoMinorVersionUpgrade: true,
        enablePerformanceInsights: true,
        performanceInsightRetention:
          rds.PerformanceInsightRetention.DEFAULT,
        publiclyAccessible: false,
      }),
    );

    // subnetGroupを作成する
    const subnetGroup = new rds.SubnetGroup(this, 'SubnetGroup', {
      vpc,
      vpcSubnets: vpcSubnets,
      description: 'Subnet Group',
    });

    // Aurora Clusterを作成する
    this.auroraCluster = new rds.DatabaseCluster(this, 'AuroraDatabase', {
      engine: auroraEngine,
      credentials: auroraClusterCrendentials,
      backup: {
        preferredWindow: backupWindow,
        retention: Duration.days(backupRetentionDays),
      },
      parameterGroup: auroraParameterGroup,
      storageEncrypted: true,
      deletionProtection: true,
      removalPolicy: RemovalPolicy.SNAPSHOT,
      copyTagsToSnapshot: true,
      cloudwatchLogsExports: cloudwatchLogsExports,
      cloudwatchLogsRetention: logs.RetentionDays.ONE_MONTH,
      preferredMaintenanceWindow: preferredMaintenanceWindow,
      instanceIdentifierBase: props.dbName,
      vpc: vpc,
      writer: writerInstance,
      readers: readerInstances,
      defaultDatabaseName: props.dbName,
      securityGroups: [rdsSg],
      subnetGroup: subnetGroup,
    });

    // 削除ポリシーを設定する
    this.auroraCluster.applyRemovalPolicy(RemovalPolicy.RETAIN);

    // マスターユーザーのパスワードの自動ローテーションを設定する
    this.auroraCluster.addRotationSingleUser({
      automaticallyAfter: Duration.days(30),
      excludeCharacters: "\"@/\\ '",
      vpcSubnets: vpcSubnets,
    });


    // RDS Proxyの作成
    const rdsProxy = new rds.DatabaseProxy(this, 'RdsProxy', {
      proxyTarget: rds.ProxyTarget.fromCluster(this.auroraCluster), // Auroraクラスタをターゲットに
      secrets: [secretManager], // Proxyで使用するSecrets Managerの認証情報
      vpc,
      idleClientTimeout: Duration.minutes(30), // アイドル接続のタイムアウト
      securityGroups: [rdsProxySg],
      vpcSubnets: vpcSubnets,
      requireTLS: false, // TLSを任意にする
    });

    // RDS ProxyのEndpointをエクスポート
    new CfnOutput(this, 'RDSProxyEndpointExport', {
      value: rdsProxy.endpoint,
      exportName: 'rdsProxyEndpoint',
    });
  }
}
