import {
  StackProps,
  Duration,
} from 'aws-cdk-lib';
import { DatabaseCluster } from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';
import { ITopic } from 'aws-cdk-lib/aws-sns';
import { Alarm, ComparisonOperator } from 'aws-cdk-lib/aws-cloudwatch';
import { Dashboard, GraphWidget } from 'aws-cdk-lib/aws-cloudwatch';

export interface AuroraProps extends StackProps {
  /**
   * モニタリングするAurora Clusterのオブジェクト
   */
  readonly auroraCluster: DatabaseCluster;

  /**
   * Auroraのアラートを通知するSNS Topicオブジェクト
   */
  readonly alertTopic: ITopic;
}

/**
 * Auroraのモニタリングダッシュボードとアラートを作成する
 * 
 * - Aurora CPU使用率アラート（5分間の最大が90%以上）
 * - Auroraのモニタリングダッシュボード
 */
export class AuroraWatch extends Construct {
  constructor(scope: Construct, id: string, props: AuroraProps) {
    super(scope, id);

    // CPU使用率アラームの作成（5分間の最大が90%以上）
    new Alarm(this, 'RdsCpuHighAlarm', {
      metric: props.auroraCluster.metricCPUUtilization({
        statistic: 'Maximum',   // 5分間の最大値を評価
        period: Duration.minutes(5), // 5分間隔
      }),
      threshold: 90, // 閾値を90%に設定
      evaluationPeriods: 1, // 評価期間（5分間）で1回評価
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD, // 閾値より高い場合にトリガー
      alarmDescription: 'RDSの5分間の最大CPU使用率が90%を超えました。',
    });

    // カスタムダッシュボードを作成 
    // https://github.com/aws-samples/aws-cdk-examples/tree/main/typescript/rds/aurora をそのまま利用
    const dashboard = new Dashboard(this, 'AuroraMonitoringDashboard');

    let dbConnections = props.auroraCluster.metricDatabaseConnections();
    let cpuUtilization = props.auroraCluster.metricCPUUtilization();
    let deadlocks = props.auroraCluster.metricDeadlocks();
    let freeLocalStorage = props.auroraCluster.metricFreeLocalStorage();
    let freeableMemory = props.auroraCluster.metricFreeableMemory();
    let networkRecieveThroughput = props.auroraCluster.metricNetworkReceiveThroughput();
    let networkThroughput = props.auroraCluster.metricNetworkThroughput();
    let networkTransmitThroughput = props.auroraCluster.metricNetworkTransmitThroughput();
    let snapshotStorageUsed = props.auroraCluster.metricSnapshotStorageUsed();
    let totalBackupStorageBilled = props.auroraCluster.metricTotalBackupStorageBilled();
    let volumeBytesUsed = props.auroraCluster.metricVolumeBytesUsed();
    let volumeReadIoPs = props.auroraCluster.metricVolumeReadIOPs();
    let volumeWriteIoPs = props.auroraCluster.metricVolumeWriteIOPs();


    //  The average amount of time taken per disk I/O operation (average over 1 minute)
    const readLatency = props.auroraCluster.metric('ReadLatency', {
      statistic: 'Average',
      period: Duration.seconds(60),
    });

    const widgetDbConnections = new GraphWidget({
      title: 'DB Connections',
      // Metrics to display on left Y axis.
      left: [dbConnections],
    });

    const widgetCpuUtilizaton = new GraphWidget({
      title: 'CPU Utilization',
      // Metrics to display on left Y axis
      left: [cpuUtilization],
    });

    const widgetReadLatency = new GraphWidget({
      title: 'Read Latency',
      //  Metrics to display on left Y axis.
      left: [readLatency],
    });

    freeLocalStorage = props.auroraCluster.metricFreeLocalStorage();
    freeableMemory = props.auroraCluster.metricFreeableMemory();
    networkRecieveThroughput = props.auroraCluster.metricNetworkReceiveThroughput();
    networkThroughput = props.auroraCluster.metricNetworkThroughput();
    networkTransmitThroughput = props.auroraCluster.metricNetworkTransmitThroughput();
    snapshotStorageUsed = props.auroraCluster.metricSnapshotStorageUsed();
    totalBackupStorageBilled = props.auroraCluster.metricTotalBackupStorageBilled();
    volumeBytesUsed = props.auroraCluster.metricVolumeBytesUsed();
    volumeReadIoPs = props.auroraCluster.metricVolumeReadIOPs();
    volumeWriteIoPs = props.auroraCluster.metricVolumeWriteIOPs();

    const widgetDeadlocks = new GraphWidget({
      title: 'Deadlocks',
      left: [deadlocks],
    });

    const widgetFreeLocalStorage = new GraphWidget({
      title: 'Free Local Storage',
      left: [freeLocalStorage],
    });

    const widgetFreeableMemory = new GraphWidget({
      title: 'Freeable Memory',
      left: [freeableMemory],
    });

    const widget_network_receive_throughput = new GraphWidget({
      title: 'Network Throuput',
      left: [networkRecieveThroughput, networkThroughput, networkTransmitThroughput],

    });

    const widgetTotalBackupStorageBilled = new GraphWidget({
      title: 'Backup Storage Billed',
      left: [totalBackupStorageBilled],
    });

    const widgetVolumeBytes = new GraphWidget({
      title: 'Storage',
      left: [volumeBytesUsed, snapshotStorageUsed],
    });

    const widgetVolumeIops = new GraphWidget({
      title: 'Volume IOPs',
      left: [volumeReadIoPs, volumeWriteIoPs],
    });


    dashboard.addWidgets(
      widgetDbConnections,
      widgetCpuUtilizaton
    );
    dashboard.addWidgets(
      widgetTotalBackupStorageBilled,
      widgetFreeLocalStorage
    );
    dashboard.addWidgets(
      widgetFreeableMemory,
      widgetVolumeBytes,
      widgetVolumeIops,
    );
    dashboard.addWidgets(
      widget_network_receive_throughput,
      widgetReadLatency,
      widgetDeadlocks,
    );
  }
}
