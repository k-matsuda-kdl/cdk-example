/* eslint-disable import/no-extraneous-dependencies */
import { Duration, Stack, Tags } from 'aws-cdk-lib';
import {
  Instance,
  InstanceType,
  InstanceClass,
  InstanceSize,
  CloudFormationInit,
  InitConfig,
  InitFile,
  InitCommand,
  UserData,
  MachineImage,
  AmazonLinuxCpuType,
  IVpc,
  SubnetType,
  ISecurityGroup,
  BlockDeviceVolume,
  EbsDeviceVolumeType,
} from 'aws-cdk-lib/aws-ec2';
import {
  Role,
  ServicePrincipal,
  ManagedPolicy,
  PolicyDocument,
  PolicyStatement,
} from 'aws-cdk-lib/aws-iam';
import { CfnLifecyclePolicy } from 'aws-cdk-lib/aws-dlm';
import { Construct } from 'constructs';

interface BastionEC2Props {
  /**
   * BationEC2を配置するVPC
   */
  vpc: IVpc;

  /**
   * BastionEC2にSSHするときの鍵認証に使うSSH公開鍵
   * 
   * @example 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQD...'
   * @default ''
   */
  sshPubKey: string;

  /**
   * BastionEC2にアクセスを許可するセキュリティグループ
   */
  sg: ISecurityGroup;
}

/**
 * BastionEC2を作成する
 * 
 * - EC2 public subnetに配置
 * - CloudWatch Logsにログを送信するための権限とSSMAgentを動かすための権限を持つRole
 * - MySQLクライアントをインストール
 * - CloudWatch Agentをインストール
 * - LifecyclePolicy
 */
export class BastionEC2 extends Construct {
  /**
   * 作成されたEC2のオブジェクト
   */
  public readonly instance: Instance;

  constructor(scope: Construct, id: string, props: BastionEC2Props) {
    super(scope, id);

    const { sshPubKey, vpc, sg } = props;
    const vpcSubnets = vpc.selectSubnets({ subnetType: SubnetType.PUBLIC })

    // EC2のRoleを作成 CloudWatch Logsにログを送信するための権限を追加
    const serverRole = new Role(this, 'serverEc2Role', {
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
      inlinePolicies: {
        ['RetentionPolicy']: new PolicyDocument({
          statements: [
            new PolicyStatement({
              resources: ['*'],
              actions: ['logs:PutRetentionPolicy'],
            }),
          ],
        }),
      },
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'), // SSMAgentをインストールするための権限
        ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'), // CloudWatch Logsにログを送信するための権限
      ],
    });

    const userData = UserData.forLinux();

    // 初期コマンド MySQLクライアントのインストール
    userData.addCommands(
      'yum update -y',
      'yum install -y amazon-cloudwatch-agent',
      'yum -y localinstall  https://dev.mysql.com/get/mysql80-community-release-el9-1.noarch.rpm',
      'rpm --import https://repo.mysql.com/RPM-GPG-KEY-mysql-2023',
      'yum -y install mysql mysql-community-client',
    );

    // EC2の作成
    this.instance = new Instance(this, 'Instance', {
      vpc: vpc,
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MICRO), // t2.microとする
      machineImage: MachineImage.latestAmazonLinux2023({
        cachedInContext: false,
        cpuType: AmazonLinuxCpuType.X86_64, // x86_64とする
      }),
      vpcSubnets: vpcSubnets,
      userData: userData,
      securityGroup: sg,
      blockDevices: [{
        deviceName: '/dev/xvda',
        volume: BlockDeviceVolume.ebs(8, { // ルートボリュームのサイズを指定
          encrypted: true, // ボリュームを暗号化
          volumeType: EbsDeviceVolumeType.GP3,
        }),
      }],
      init: CloudFormationInit.fromConfigSets({
        configSets: {
          default: ['config'],
        },
        configs: {
          config: new InitConfig([
            InitFile.fromObject('/etc/config.json', {
              // Use CloudformationInit to create an object on the EC2 instance
              STACK_ID: Stack.of(this).artifactId,
            }),
            InitFile.fromFileInline(
              // Use CloudformationInit to copy a file to the EC2 instance
              '/tmp/amazon-cloudwatch-agent.json',
              './lib/resources/server/config/amazon-cloudwatch-agent.json',
            ),
            InitFile.fromFileInline(
              '/etc/config.sh',
              'lib/resources/server/config/config.sh',
            ),
            InitFile.fromString(
              // Use CloudformationInit to write a string to the EC2 instance
              '/home/ec2-user/.ssh/authorized_keys',
              sshPubKey + '\n',
            ),
            InitCommand.shellCommand('chmod +x /etc/config.sh'), // Use CloudformationInit to run a shell command on the EC2 instance
            InitCommand.shellCommand('/etc/config.sh'),
          ]),
        },
      }),

      initOptions: {
        timeout: Duration.minutes(10),
        includeUrl: true,
        includeRole: true,
        printLog: true,
      },
      role: serverRole,
    });
    Tags.of(this.instance).add("Backup", "True");
    new CfnLifecyclePolicy(this, 'EbsSnapshotLifecyclePolicy', {
      description: 'Daily snapshot of EC2 instances',
      state: 'ENABLED',
      executionRoleArn: serverRole.roleArn,
      policyDetails: {
        resourceTypes: ['INSTANCE'],
        targetTags: [{ key: 'Backup', value: 'True' }],
        schedules: [{
          name: 'DailySnapshots',
          tagsToAdd: [{ key: 'Snapshot', value: 'Daily' }],
          createRule: { interval: 24, intervalUnit: 'HOURS', times: ['19:00'] },
          retainRule: { count: 7 }, // 7日間保持
        }],
      },
    });
  }
}
