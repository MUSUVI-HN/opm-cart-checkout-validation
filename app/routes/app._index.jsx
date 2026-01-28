import { json } from "@remix-run/node";
import {
  useLoaderData,
  useNavigate,
  useNavigation,
  useSearchParams,
  Form,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  TextField,
  Button,
  InlineStack,
  Thumbnail,
  Pagination,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { useState } from "react";

// バックエンドの部分データを「load」しとるんや。
export const loader = async ({ context, request }) => {
  // admin: Shopifyのデータにアクセスするための「特権キー」を取得
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const direction = url.searchParams.get("direction");
  const query = url.searchParams.get("query");

  const isBackward = direction === "before";

  const response = await admin.graphql(
    `#graphql
    query getProducts(
      $first: Int, $last: Int, $after: String, $before: String, $query: String
    ) { products(
      first: $first, last: $last, after: $after, before: $before, query: $query
      ) {
        edges {
          node {
            id
            title
            handle
            featuredImage {
              url
              altText
            }
            metafield(namespace: "custom", key: "order_limit") {
              value
            }
          }
        }
        pageInfo {
          hasPreviousPage
          hasNextPage
          startCursor
          endCursor
        }
      }
    }`,
    {
      variables: {
        // beforeがある場合
        first: isBackward ? null : 10,
        last: isBackward ? 10 : null,
        after: isBackward ? null : cursor,
        before: isBackward ? cursor : null,
        query: query,
      },
    },
  );

  const responseJson = await response.json();

  // jsonデータにして読めるようにする
  return json({
    products: responseJson.data.products.edges || [],
    pageInfo: responseJson.data.products.pageInfo || {},
  });
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const limitDataString = formData.get("limitData");
  const limitData = JSON.parse(limitDataString || "{}");

  const metafieldsToUpdate = Object.entries(limitData).map(
    ([productId, value]) => ({
      ownerId: productId,
      namespace: "custom",
      key: "order_limit",
      type: "number_integer", // 数値として保存
      value: value.toString(), // GraphQLに渡すときは文字列にする
    }),
  );

  if (metafieldsToUpdate.length === 0) {
    return json({ success: true });
  }

  const response = await admin.graphql(
    `#graphql
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          value
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        metafields: metafieldsToUpdate,
      },
    },
  );

  const responseJson = await response.json();
  // console.log("保存結果:", JSON.stringify(responseJson.data, null, 2));

  return json({ success: true });
};

// フロントエンドの部分
export default function Index() {
  const { products, pageInfo } = useLoaderData();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";
  const [formState, setFormState] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();

  // 検索ワードをURLから取得
  const searchQuery = searchParams.get("query") || "";

  const handleSearch = (value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set("query", value);
    } else {
      newParams.delete("query"); // 空なら消す
    }
    newParams.delete("cursor"); // 検索ワードが変わったら1ページ目に戻す
    setSearchParams(newParams);
  };

  return (
    <Page>
      <TitleBar title="OPM購入制限アプリ" />
      <Layout>
        <Layout.Section>
          <Card>
            <Form method="POST">
              {/* どの商品IDが何の数字になったかをJSONの文字列にして隠して送る */}
              <input
                type="hidden"
                name="limitData"
                value={JSON.stringify(formState)}
              />
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  商品ごとの制限を設定する
                </Text>

                <TextField
                  label="商品を検索"
                  value={searchQuery}
                  onChange={handleSearch}
                  placeholder="商品名を入力..."
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => handleSearch("")}
                />

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "15px",
                  }}
                >
                  {products.map(({ node }) => (
                    // key: Reactが「どの行か」を識別するための背番号（商品IDを使用）
                    <div
                      key={node.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        borderBottom: "1px solid #f1f1f1",
                        paddingBottom: "10px",
                      }}
                    >
                      <InlineStack gap="300" align="start">
                        <Thumbnail
                          source={node.featuredImage?.url || ""} // 画像がない場合は空
                          alt={node.featuredImage?.altText || node.title}
                          size="small"
                        />
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            height: "40px",
                          }}
                        >
                          <Text as="span" variant="bodyMd">
                            {node.title}
                          </Text>
                        </div>
                      </InlineStack>

                      <div style={{ width: "120px" }}>
                        <TextField
                          label="制限数"
                          labelHidden
                          type="number"
                          // 表示する値：Stateにあればそれを、なければ元の値を出す
                          value={formState[node.id] ?? node.metafield?.value}
                          onChange={(newValue) => {
                            setFormState({
                              ...formState,
                              [node.id]: newValue,
                            });
                          }}
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    padding: "10px",
                  }}
                >
                  <Pagination
                    onPrevious={() => {
                      const prevCursor = pageInfo.startCursor;
                      // URLを「?cursor=しおり&direction=before」に書き換えて移動！
                      navigate(`?cursor=${prevCursor}&direction=before`);
                    }}
                    onNext={() => {
                      const nextCursor = pageInfo.endCursor;
                      // URLを「?cursor=しおり&direction=after」に書き換えて移動！
                      navigate(`?cursor=${nextCursor}&direction=after`);
                    }}
                    hasNext={!isLoading && pageInfo.hasNextPage}
                    hasPrevious={!isLoading && pageInfo.hasPreviousPage}
                  />
                </div>

                <Button submit variant="primary" loading={isLoading}>
                  保存する
                </Button>
              </BlockStack>
            </Form>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
