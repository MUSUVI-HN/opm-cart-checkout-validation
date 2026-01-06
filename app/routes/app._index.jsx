import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, Text, BlockStack } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  // admin: Shopifyのデータにアクセスするための「特権キー」を取得
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
    query getProducts {
      products(first: 10) {
        edges {
          node {
            id
            title
            handle
            metafield(namespace: "custom", key: "order_limit") {
              value
            }
          }
        }
      }
    }`
  );

  const responseJson = await response.json();

  return json({
    products: responseJson.data.products.edges,
  });
};

export default function Index() {
  const { products } = useLoaderData();

  return (
    <Page>
      <TitleBar title="OPM購入制限アプリ" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                商品ごとの制限を設定する
              </Text>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {products.map(({ node }) => (
                  // key: Reactが「どの行か」を識別するための背番号（商品IDを使用）
                  <div key={node.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #f1f1f1',
                    paddingBottom: '10px'
                  }}>
                    <Text as="span" variant="bodyMd">{node.title}</Text>

                    <Text as="span" variant="bodyMd" fontWeight="bold">
                      {/* node.metafield?.value: メタフィールドがあればその値、なければ null
                        || "未設定": null の場合に代わりに表示する文字
                      */}
                      制限数: {node.metafield?.value || "未設定"}
                    </Text>
                  </div>
                ))}
              </div>

            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}