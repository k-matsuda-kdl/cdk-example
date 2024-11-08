# backend
このフォルダは、backendのAPIソースを管理するフォルダです。Lambdaで動くこと想定しています。なお、ローカル環境での実行は、`AWS SAM`を利用します。

## 構成 / components
backend APIの技術スタックは以下の通りです。

* Nodejs 20
* Prisma
* Lambda
* MySQL

## 動かすのに必要な要件 / Environments

* docker
* docker compose v2 
* nodejs 20
* [AWS SAM cli](https://docs.aws.amazon.com/ja_jp/serverless-application-model/latest/developerguide/install-sam-cli.html)

## 構築手順 / deployment
デプロイについては、[プロジェクトルートのREADME](../README.md)を参照してください

## 使用方法 / Usage
### ローカル実行
- backend
    バックエンドのローカル実行は、dockerでMySQLのDBを動かし`sam`で実行する
    ```
    cd backend
    docker compose up -d
    sam build
    sam local start-api --docker-network backend_lambda-network
    ```

    localhost:3000 でAPIが立ち上がる

### DBマイグレーション
ORMマッパーとして、`prisma`を使っています。適宜変更してもらって構いません。

以下のコマンドを実行するとスキーマ定義に従って、マイグレーションファイルの作成とマイグレーションを実行します

``` bash
npx prisma migrate dev
```

※ローカルから実行する場合、`backend/main-function/.env`でローカルからの接続先を定義しています。パスワードは、`docker-compose.yml`の内容と合わせてください

``` bash
DATABASE_URL="mysql://root:S9mRUafBjR2W@localhost:13306/demo"
```

### DBの接続先

DBの接続情報に以下のとおりになる
- ローカルPCからMySQLのコンテナに接続する

  `backend/main-function/.env`
  ``` bash
  DATABASE_URL="mysql://root:S9mRUafBjR2W@localhost:13306/demo"
  ```

- samで実行したローカルのLambda環境からMySQLのコンテナに接続する

  `backend/template.yaml`

  ``` bash
      Environment: 
        Variables:
          DATABASE_URL: mysql://root:S9mRUafBjR2W@db:3306/demo
  ```

- AWS環境でRDSに接続する

  Lambdaの環境変数で以下の内容を設定すると接続できる。※`ENV_NAME`は`production`固定です。

  ``` bash
  RDS_PROXY_ENDPOINT: # RDS_PROXYのエンドポイント
  ENV_NAME: 'production'
  SECRET_MANAGER_ARN: # SecretManagerのArn
  ```

 
## 注意点 / Note

- Prismaのライブラリは、Javascriptだけではないものが含まれ、`libquery_engine-rhel-openssl-3.0.x.so.node`と`schema.prisma`も実行に必要になる。Lambda側にもアップロードする必要がある

  `backend/main-function/app.ts`の`console.log`は、schemaとxをビルドに含めるための呼び出してです。

  ``` javascript
  import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
  import { PrismaClient } from '@prisma/client'
  import schema from './prisma/schema.prisma'
  import x from './node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node'
  import { getPrismaClient } from './lib/dbclient'

  // buildでscemaとxを入れるためだけにlog出力する
  console.log(schema, x);
  ```

  さらに、`backend/.aws-sam/deps/`フォルダに、ビルド時のキャッシュファイルが格納されている。`schema.prisma`の変更があった場合、キャッシュファイルを削除しないと正しくビルドに反映されないので、削除してください。

## 作成者 / Author

* 松田康司
* 神戸デジタル・ラボ / 生産技術チーム
* k-matsuda@kdl.co.jp
 
