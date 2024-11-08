import {
  SecurityGroup,
  Peer,
  Port,
  SubnetType,
  Vpc,
  IVpc,
  ISecurityGroup,
  InterfaceVpcEndpoint,
  InterfaceVpcEndpointAwsService,
  FlowLogDestination,
  FlowLogTrafficType,
} from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { RemovalPolicy } from 'aws-cdk-lib';

interface BaseVpcProps {
  /**
   * 許可するsshのIPv4アドレスリストを,(カンマ)区切りかつCIDR記法で記述
   * 
   * @example '0.0.0.0/0,192.168.1.0/22'
   * @default ''
   */
  allowSshIps?: string;
}

/**
 * 基本となるVPCを作成する
 * 
 * - VPC
 * - public, private, isolatedの3つのsubnet
 * - AZは2つ
 * - 踏み台EC2用のセキュリティグループ
 * - Lambda関数用のセキュリティグループ
 * - Secrets ManagerへのVPCエンドポイント
 */
export class BaseVpc extends Construct {
  /**
   * 作成されたVPCのオブジェクト
   */
  public readonly vpc: IVpc;
  /**
   * 踏み台EC2用のセキュリティグループ
   */
  public readonly bastionSg: ISecurityGroup;
  /**
   * Lambda関数用のセキュリティグループ
   */
  public readonly lambdaSg: ISecurityGroup;
  /**
   * RDS Proxy用のセキュリティグループ
   */
  public readonly rdsProxySg: ISecurityGroup;
  /**
   * RDS用のセキュリティグループ
   */
  public readonly rdsSg: ISecurityGroup

  constructor(scope: Construct, id: string, props: BaseVpcProps) {
    super(scope, id);

    // 2つのAZを持つVPCを作る
    this.vpc = new Vpc(this, 'VPC', {
      natGateways: 0, // NATゲートウェイを作らない
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: SubnetType.PUBLIC,
          mapPublicIpOnLaunch: true,
        },
        {
          cidrMask: 24,
          name: 'Isolated',
          subnetType: SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
      maxAzs: 2,
    });

    // VPCフローログ用のロググループ
    const flowLogGroup = new LogGroup(this, 'VpcFlowLogGroup', {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY, // 開発環境用のため削除許可
    });

    // VPCフローログを有効化
    this.vpc.addFlowLog('VpcFlowLog', {
      destination: FlowLogDestination.toCloudWatchLogs(flowLogGroup),
      trafficType: FlowLogTrafficType.ALL, // 必要に応じてALL, ACCEPT,またはREJECTを指定
    });

    // 踏み台用セキュリティグループを作る
    this.bastionSg = new SecurityGroup(this, 'ec2InstanceSecurityGroup', {
      vpc: this.vpc,
      description: 'Bation for SSH',
      allowAllOutbound: true
    });

    // IPアドレスに対してSSHアクセスを許可
    const tcp22 = Port.tcp(22);
    if (props.allowSshIps) {
      // 各IPアドレスに対してSSHアクセスを許可
      const ips = props.allowSshIps.split(',').map(ip => ip.trim());
      ips.forEach(ip => {
        this.bastionSg.addIngressRule(Peer.ipv4(ip), tcp22, `Allow SSH access from ${ip}`);
      });
    }
    
    // Lambda関数用セキュリティグループを作る
    this.lambdaSg = new SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: this.vpc,
      description: 'lambdaSg',
      allowAllOutbound: true
    });

    // RDS Proxy用セキュリティグループを作る
    // RDS用セキュリティグループを作る
    // 循環参照になってしまうため、RDSStackで作成する

    // Secrets ManagerへのVPCエンドポイントを作成
    new InterfaceVpcEndpoint(this, 'SecretsManagerVpcEndpoint', {
      vpc: this.vpc,
      service: InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [this.lambdaSg], // Lambdaからのアクセスのみ許可
      privateDnsEnabled: true,
    });
  }
}
