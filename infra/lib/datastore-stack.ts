import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ISecurityGroup, IVpc } from 'aws-cdk-lib/aws-ec2';
import { ITopic } from 'aws-cdk-lib/aws-sns';
import { AuroraMySQL } from './common/datastore/aurota';
import { AuroraWatch } from './common/monitoring/aurora-watch';

interface DatastoreStackProps extends StackProps {
  /**
   * Applicationを配置するVPC LambdaはこのVPC内に配置される
   */
  vpc: IVpc;

  /**
   * Auroraにアクセスを許可するセキュリティグループリスト
   */
  allowSgs: ISecurityGroup[];

  /**
   * Auroraのアラートを通知するSNS Topic
   */
  alertTopic: ITopic;
}

/**
 * データストアを作成する
 * - Aurora MySQL
 * - Aurora Watch(Auroraの監視やアラート)
 */
export class DatastoreStack extends Stack {
  constructor(scope: Construct, id: string, props: DatastoreStackProps) {
    super(scope, id, props);

    // Aurora Clusterを作成
    const auroraCluster = new AuroraMySQL(this, 'AuroraMySQL',{
      vpc: props.vpc,
      dbName: 'demo',
      allowSgs: props.allowSgs,
    }).auroraCluster;
    
    // Auroraのモニタリングするダッシュボードとアラートを作成
    new AuroraWatch(this, 'AuroraWatch',{
      auroraCluster: auroraCluster,
      alertTopic: props.alertTopic,
    });
  }
}
