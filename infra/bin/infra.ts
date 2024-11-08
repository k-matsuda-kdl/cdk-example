#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { config } from 'dotenv';
import { BaseInfraStack } from '../lib/base-infra-stack';
import { DatastoreStack } from '../lib/datastore-stack';
import { ApplicationStack } from '../lib/application-stack';

config();

// 環境変数から実行環境を取得 accountを指定することで、間違って他のアカウントにデプロイしないようにする
const env = {
  account: process.env.ACCOUNT_ID || '',
  region: process.env.REGION || 'ap-northeast-1',
};

// sshを許可するIPアドレスリスト CIDR記法で記述
const allowSshIps = process.env.ALLOW_SSH_IPS_SEPARATED_BY_COMMA || '';
// httpsを許可するIPアドレスリスト なければ全許可
const allowHttpsIps = process.env.ALLOW_HTTPS_IPS_SEPARATED_BY_COMMA || '';
// SSH公開鍵
const sshPubKey = process.env.SSH_PUB_KEY || ' ';
// アラートメールアドレス
const alertEmail = process.env.ALERT_EMAIL || '';

const app = new cdk.App();

const baseInfraStack = new BaseInfraStack(app, 'BaseInfraStack', {
  env: env,
  allowSshIps: allowSshIps,
  sshPubKey: sshPubKey,
  alertEmail: alertEmail,
});

const datastorestack = new DatastoreStack(app, 'DatastoreStack', {
  env: env,
  vpc: baseInfraStack.vpc.vpc,
  allowSgs: [baseInfraStack.vpc.lambdaSg, baseInfraStack.vpc.bastionSg],
  alertTopic: baseInfraStack.alertToipcs,
});
datastorestack.addDependency(baseInfraStack);

// Lambdaからの参照先を、Outputから取得する datastoreStackとの依存度を減らすため
const auroraSecretManagerArn = cdk.Fn.importValue('auroraSecretManagerArn');
const rdsProxyEndpoint = cdk.Fn.importValue('rdsProxyEndpoint');

const applicationstack = new ApplicationStack(app, 'ApplicationStack', {
  env: env,
  vpc: baseInfraStack.vpc.vpc,
  lambdaSg: baseInfraStack.vpc.lambdaSg,
  allowIps: allowHttpsIps,
  auroraSecretManagerArn: auroraSecretManagerArn,
  rdsProxyEndpoint: rdsProxyEndpoint,
});
applicationstack.addDependency(baseInfraStack);
