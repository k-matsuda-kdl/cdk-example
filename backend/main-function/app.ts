import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PrismaClient } from '@prisma/client'
import schema from './prisma/schema.prisma'
import x from './node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node'
import { getPrismaClient } from './lib/dbclient'

// buildでscemaとxを入れるためだけにlog出力する
console.log(schema, x);

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */

export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const prisma = await getPrismaClient();
  try {
    await main(prisma);
    await prisma.$disconnect()
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'hello world',
      }),
    };
  } catch (err) {
    console.log(err);
    await prisma.$disconnect()
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'some error happened',
      }),
    };
  }
};

async function main(prisma: PrismaClient) {
  const user = await prisma.user.create({
    data: {
      name: `${randomString(10)}`,
      email: `${randomString(10)}@kdl.co.jp`,
    },
  })
  console.log(user)
}
// ランダム文字列を生成する
function randomString(length: number): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let result = ''
  for (let i = length; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)]
  return result
}
