import { Construct } from 'constructs';
import { Topic, ITopic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';

interface AlertSNSTopicProps {
  /**
   * アラートメールを受信するメールアドレス
   * 
   * @example 'example@example.com'
   */
  alertEmail: string;
}

/**
 * アラートを通知するSNS Topicを作成する
 * 
 * - Topic
 * - EmailSubscription
 */
export class AlertSNSTopic extends Construct {
  public readonly topic: ITopic;

  constructor(scope: Construct, id: string, props: AlertSNSTopicProps) {
    super(scope, id);
    this.topic = new Topic(this, 'AlertTopic', {
      displayName: 'AlertTopic',
    });
    
    // メールアドレスをサブスクライブ
    this.topic.addSubscription(new EmailSubscription(props.alertEmail));
  }
}
