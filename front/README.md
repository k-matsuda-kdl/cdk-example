# front
このフォルダは、front画面のソースを管理するフォルダです。

## 構成 / components
frontの技術スタックは以下の通りです。

* React
* Amplify Library
* Cognito

## 動かすのに必要な要件 / Environments

* nodejs 20 ビルド用

## 構築手順 / deployment
デプロイについては、[プロジェクトルートのREADME](../README.md)を参照してください

## 使用方法 / Usage
### インストール
``` bash
cd front
npm install
```

### ローカル実行
frontは、viteで起動する。

APIの向き先がハードコードされているので、ローカルに変更する

`front/src/App.tsx:17`
``` javascript
const response = await fetch('/api/hello/', {
```

また、Cognitoは構築済みのものを`front/.env`に記述する

`front/.env`
``` bash
VITE_COGNITO_USER_POOL_ID=
VITE_COGNITO_CLIENT_ID=
VITE_COGNITO_IDENTITY_POOL_ID=
```

起動は、`npm run dev`
```
cd front
npm run dev
```

`http://localhost:5173/`でフロントが立ち上がる

### ビルド
ビルドは、前に`front/.env`にCognitoの情報が入っていることを確認し、`npm run build`を実行する

``` bash
cd front
npm run build
```
 
## 注意点 / Note

- Amplifyライブラリは、単独で使っています。Amplify cliは不要です。

## 作成者 / Author

* 松田康司
* 神戸デジタル・ラボ / 生産技術チーム
* k-matsuda@kdl.co.jp
 
