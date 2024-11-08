import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BaseVpc } from './common/network/base-vpc';
import { BastionEC2 } from './common/compute/bastion-ec2';
import { AlertSNSTopic } from './common/monitoring/alert-sns-topics';
import { ITopic } from 'aws-cdk-lib/aws-sns';

interface BaseInfraStackProps extends StackProps {
  /**
   * 許可するsshのIPv4アドレスリストを,(カンマ)区切りかつCIDR記法で記述
   * 
   * @example '0.0.0.0/0,192.168.1.0/22'
   * @default ''
   */
  allowSshIps?: string; // SSHアクセスを許可するIPアドレス

  /**
   * BastionEC2にSSHするときの鍵認証に使うSSH公開鍵
   * 
   * @example 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQD...'
   */
  sshPubKey: string; // SSH公開鍵

  /**
   * アラートメールを受信するメールアドレス
   * 
   * @example 'exapmple@example.com'
   */
  alertEmail: string;
}

/**
 * 基本となるインフラを作成する
 * - VPC
 * - BastionEC2
 * - Alert Topic
 */
export class BaseInfraStack extends Stack {
  /**
   * 作成されたVPCのオブジェクト BaseVpcをそのまま参照する
   */
  public readonly vpc: BaseVpc;

  /**
   * 作成されたアラートSNS Topicのオブジェクト
   */
  public readonly alertToipcs: ITopic;

  constructor(scope: Construct, id: string, props: BaseInfraStackProps) {
    super(scope, id, props);


    // 基本のVpcを作成
    this.vpc = new BaseVpc(this, 'BaseVPC', {
      allowSshIps: props.allowSshIps,
    });

    // 踏み台EC2を作成
    const ec2 = new BastionEC2(this, 'BastionEC2', {
      vpc: this.vpc.vpc,
      sshPubKey: props.sshPubKey,
      sg: this.vpc.bastionSg,
    });

    // アラートSNS Topicを作成
    this.alertToipcs = new AlertSNSTopic(this, 'AlertSNSTopic', {
      alertEmail: props.alertEmail,
    }).topic;

    // SSHコマンドを出力する
    new CfnOutput(this, 'sshCommand', {
      value: `ssh ec2-user@${ec2.instance.instancePublicDnsName}`,
    });
    
  }
}
