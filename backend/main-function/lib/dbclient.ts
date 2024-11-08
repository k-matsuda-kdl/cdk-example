import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { PrismaClient } from "@prisma/client";

export async function getPrismaClient(): Promise<PrismaClient> {
  let dbClient: PrismaClient;
  if (process.env.ENV_NAME === "production" && process.env.SECRET_MANAGER_ARN && process.env.RDS_PROXY_ENDPOINT) {
    const secretsManagerClient = new SecretsManagerClient({
      region: "ap-northeast-1",
    });
    const getSecretValueCommand = new GetSecretValueCommand({
      SecretId: process.env.SECRET_MANAGER_ARN,
    });
    const getSecretValueCommandResponse = await secretsManagerClient.send(
      getSecretValueCommand
    );
    const secret = JSON.parse(getSecretValueCommandResponse.SecretString!);
    // パスワードに特殊文字が含まれる場合はエンコードする
    const encodedPassword = encodeURIComponent(secret.password);
    const dbUrl = `mysql://${secret.username}:${encodedPassword}@${process.env.RDS_PROXY_ENDPOINT}:${secret.port}/${secret.dbname}`;
    dbClient = new PrismaClient({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
    });
  } else {
    dbClient = new PrismaClient();
  }
  return dbClient;
}