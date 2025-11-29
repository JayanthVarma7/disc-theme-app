import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

type VolumeDiscountConfig = {
  products: string[];
  minQty: number;
  percentOff: number;
  widgetTemplate?: string;
};

const DEFAULT_WIDGET_TEMPLATE = "Buy {{minQty}}, get {{percentOff}}% off";

const renderWidgetCopy = (
  template: string | undefined,
  minQty: number,
  percentOff: number,
) => {
  const baseTemplate =
    template && template.trim().length > 0
      ? template
      : DEFAULT_WIDGET_TEMPLATE;

  return baseTemplate
    .replace(/{{\s*minQty\s*}}/gi, `${minQty}`)
    .replace(/{{\s*percentOff\s*}}/gi, `${percentOff}`);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // Read current config from shop metafield
  const response = await admin.graphql(
    `#graphql
      query getShopMetafield {
        shop {
          metafield(namespace: "volume_discount", key: "rules") {
            value
          }
        }
      }
    `
  );

  const responseJson = await response.json();
  const metafieldValue = responseJson.data?.shop?.metafield?.value;

  let config: VolumeDiscountConfig = {
    products: [],
    minQty: 2,
    percentOff: 10,
    widgetTemplate: DEFAULT_WIDGET_TEMPLATE,
  };

  if (metafieldValue) {
    try {
      config = JSON.parse(metafieldValue);
      config.widgetTemplate =
        config.widgetTemplate || DEFAULT_WIDGET_TEMPLATE;
    } catch (e) {
      console.error("Failed to parse metafield:", e);
    }
  }

  return { config };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "save") {
    const productIds = formData.get("productIds") as string;
    const percentOff = Number(formData.get("percentOff"));
    const widgetTemplate =
      (formData.get("widgetTemplate") as string) || DEFAULT_WIDGET_TEMPLATE;

    const config: VolumeDiscountConfig = {
      products: productIds ? productIds.split(",").filter((id) => id) : [],
      minQty: 2,
      percentOff,
      widgetTemplate,
    };

    // Save config to shop metafield
    const metafieldResponse = await admin.graphql(
      `#graphql
        mutation SetMetafield($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              namespace
              key
              value
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          metafields: [
            {
              namespace: "volume_discount",
              key: "rules",
              type: "json",
              value: JSON.stringify(config),
              ownerId: formData.get("shopGid") as string,
            },
          ],
        },
      }
    );

    const metafieldJson = await metafieldResponse.json();
    
    if (metafieldJson.data?.metafieldsSet?.userErrors?.length > 0) {
      return {
        success: false,
        errors: metafieldJson.data.metafieldsSet.userErrors,
      };
    }

    // Get or create automatic discount using the function
    // First, check if discount already exists
    const getDiscountResponse = await admin.graphql(
      `#graphql
        query GetDiscounts {
          discountNodes(first: 50, query: "title:'Volume Discount - Auto'") {
            edges {
              node {
                id
                discount {
                  ... on DiscountAutomaticApp {
                    title
                    discountId
                    startsAt
                  }
                }
              }
            }
          }
          shopifyFunctions(first: 10) {
            edges {
              node {
                id
                apiType
                title
              }
            }
          }
        }
      `
    );

    const getDiscountJson = await getDiscountResponse.json();
    const functions = getDiscountJson.data?.shopifyFunctions?.edges || [];

    const normalize = (value: unknown) =>
      typeof value === "string" ? value.trim().toLowerCase() : "";
    
    // Find our discount function by title or API target.
    const discountFunction = functions.find((edge: any) => {
      const title = normalize(edge?.node?.title);
      const apiType = normalize(edge?.node?.apiType);

      return (
        title === "volume discount function" ||
        title.includes("volume discount") ||
        apiType === "cart_lines_discounts_generate_run" ||
        apiType === "product_discounts" ||
        apiType.includes("cart_lines_discounts") ||
        apiType.includes("product_discounts")
      );
    });

    if (!discountFunction) {
      return {
        success: false,
        errors: [{ message: "Discount function not found. Please run 'shopify app deploy' first." }],
      };
    }

    const existingDiscounts = getDiscountJson.data?.discountNodes?.edges || [];
    
    if (existingDiscounts.length > 0) {
      // Update existing discount
      const discountId = existingDiscounts[0].node.id;
      
      const updateResponse = await admin.graphql(
        `#graphql
          mutation UpdateDiscount($id: ID!, $discount: DiscountAutomaticAppInput!) {
            discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $discount) {
              automaticAppDiscount {
                discountId
                title
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        {
          variables: {
            id: discountId,
            discount: {
              title: "Volume Discount - Auto",
              functionId: discountFunction.node.id,
              startsAt: new Date().toISOString(),
              discountClasses: ["PRODUCT"],
            },
          },
        }
      );

      const updateJson = await updateResponse.json();
      
      if (updateJson.data?.discountAutomaticAppUpdate?.userErrors?.length > 0) {
        return {
          success: false,
          errors: updateJson.data.discountAutomaticAppUpdate.userErrors,
        };
      }
    } else {
      // Create new automatic discount
      const createResponse = await admin.graphql(
        `#graphql
          mutation CreateAutomaticDiscount($discount: DiscountAutomaticAppInput!) {
            discountAutomaticAppCreate(automaticAppDiscount: $discount) {
              automaticAppDiscount {
                discountId
                title
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        {
          variables: {
            discount: {
              title: "Volume Discount - Auto",
              functionId: discountFunction.node.id,
              startsAt: new Date().toISOString(),
              discountClasses: ["PRODUCT"],
              combinesWith: {
                orderDiscounts: false,
                productDiscounts: false,
                shippingDiscounts: false,
              },
            },
          },
        }
      );

      const createJson = await createResponse.json();
      
      if (createJson.data?.discountAutomaticAppCreate?.userErrors?.length > 0) {
        return {
          success: false,
          errors: createJson.data.discountAutomaticAppCreate.userErrors,
        };
      }
    }

    return { success: true, config };
  }

  return { success: false };
};

export default function Index() {
  const { config } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [selectedProducts, setSelectedProducts] = useState<string[]>(
    config.products || []
  );
  const [percentOff, setPercentOff] = useState<number>(config.percentOff || 10);
  const [widgetTemplate, setWidgetTemplate] = useState<string>(
    config.widgetTemplate || DEFAULT_WIDGET_TEMPLATE,
  );
  const [shopGid, setShopGid] = useState<string>("");
  const previewMessage = renderWidgetCopy(
    widgetTemplate,
    config.minQty ?? 2,
    percentOff,
  );

  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    // Get shop GID for metafield owner
    const getShopGid = async () => {
      const response = await fetch("/app/shop-gid");
      if (response.ok) {
        const data = await response.json();
        setShopGid(data.shopGid);
      }
    };
    getShopGid();
  }, []);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("✅ Discount configured and activated! Test it in your cart.");
    } else if (fetcher.data?.success === false && fetcher.data?.errors) {
      const errorMessage = fetcher.data.errors[0]?.message || "Unknown error";
      if (errorMessage.includes("Discount function not found")) {
        shopify.toast.show("⚠️ Please run 'shopify app deploy' in your terminal first", { 
          isError: true,
          duration: 5000,
        });
      } else {
        shopify.toast.show(`Error: ${errorMessage}`, { isError: true });
      }
    }
  }, [fetcher.data, shopify]);

  const handleProductPicker = async () => {
    try {
      const selected = await shopify.resourcePicker({
        type: "product",
        action: "select",
        multiple: true,
      });

      if (selected && Array.isArray(selected)) {
        const productIds = selected.map((product: any) => product.id);
        setSelectedProducts(productIds);
        shopify.toast.show(`${selected.length} product(s) selected`);
      }
    } catch (error) {
      console.error("Product picker error:", error);
      if (error !== "Picker was closed without selection") {
        shopify.toast.show("Failed to open product picker", { isError: true });
      }
    }
  };

  const handleSave = () => {
    if (!shopGid) {
      shopify.toast.show("Shop ID not loaded yet, please try again", {
        isError: true,
      });
      return;
    }

    const formData = new FormData();
    formData.append("action", "save");
    formData.append("productIds", selectedProducts.join(","));
    formData.append("percentOff", percentOff.toString());
    formData.append(
      "widgetTemplate",
      widgetTemplate.trim() || DEFAULT_WIDGET_TEMPLATE,
    );
    formData.append("shopGid", shopGid);

    fetcher.submit(formData, { method: "POST" });
  };

  return (
    <s-page heading="Volume Discount Configuration">
      <s-button slot="primary-action" onClick={handleSave} {...(isLoading ? { loading: true } : {})}>
        Save Configuration
      </s-button>

      {/* Deployment Notice */}
      <s-banner tone="info">
        <div style={{ marginBottom: '20px' }}>
          <strong>First time setup:</strong> If this is your first time using the app, 
          run <code>shopify app deploy</code> in your terminal to deploy the discount function. 
          After deployment, come back here and click "Save Configuration".
        </div>
      </s-banner>

      <s-section heading="Configure Your 'Buy 2, Get X% Off' Discount">
        <s-paragraph>
          Set up an automatic discount that applies when customers add 2 or more
          units of selected products to their cart.
        </s-paragraph>

        <s-stack direction="block" gap="large">
          {/* Product Selection */}
          <s-stack direction="block" gap="base">
            <strong>Select Products</strong>
            <s-paragraph>
              Choose which products should be eligible for the volume discount.
            </s-paragraph>
            <s-button onClick={handleProductPicker}>
              {selectedProducts.length > 0
                ? `${selectedProducts.length} product(s) selected`
                : "Select Products"}
            </s-button>
            {selectedProducts.length > 0 && (
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <div>
                  <strong>Selected product IDs:</strong>
                </div>
                <div style={{ marginTop: '8px' }}>
                  {selectedProducts.map((id) => (
                    <div key={id} style={{ fontSize: '14px', marginBottom: '4px' }}>
                      {id}
                    </div>
                  ))}
                </div>
              </s-box>
            )}
          </s-stack>

          {/* Discount Percentage */}
          <s-stack direction="block" gap="base">
            <strong>Discount Percentage</strong>
            <s-paragraph>
              Set the discount percentage (1-80%) for qualifying products.
            </s-paragraph>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              <input
                type="number"
                value={percentOff}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 10;
                  setPercentOff(Math.min(Math.max(value, 1), 80));
                }}
                min="1"
                max="80"
                style={{
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  fontSize: "14px",
                  width: "120px",
                }}
              />
              <span>%</span>
            </div>
            <div>
              <small style={{ color: "#6b7280" }}>
                Minimum quantity is fixed at 2 units
              </small>
            </div>
          </s-stack>

          {/* Preview */}
          <s-stack direction="block" gap="base">
            <strong>Discount Preview</strong>
            <div
              style={{
                padding: "12px",
                border: "1px solid #3b82f6",
                borderRadius: "8px",
                backgroundColor: "#eff6ff",
              }}
            >
              <div style={{ fontWeight: "bold", fontSize: "16px", marginBottom: "4px" }}>
                {previewMessage}
              </div>
              <div style={{ fontSize: "14px", color: "#6b7280" }}>
                This message will appear on product pages and in the cart.
              </div>
            </div>
          </s-stack>

          {/* Widget Messaging */}
          <s-stack direction="block" gap="base">
            <strong>Widget Message</strong>
            <s-paragraph>
              Control the text your theme block displays. Use{" "}
              <code>{"{{minQty}}"}</code> and <code>{"{{percentOff}}"}</code> to
              inject live values.
            </s-paragraph>
            <textarea
              value={widgetTemplate}
              onChange={(e) => setWidgetTemplate(e.target.value)}
              style={{
                minHeight: "80px",
                padding: "12px",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                fontSize: "14px",
                width: "100%",
                maxWidth: "100%",
                minWidth: 0,
                boxSizing: "border-box",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </s-stack>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="How it works">
        <s-unordered-list>
          <s-list-item>
            Select the products eligible for the volume discount
          </s-list-item>
          <s-list-item>
            Set your desired discount percentage (1-80%)
          </s-list-item>
          <s-list-item>
            The discount automatically applies when customers add 2+ units
          </s-list-item>
          <s-list-item>
            A widget will display the offer on product pages
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section slot="aside" heading="Theme Setup">
        <s-paragraph>
          After saving your configuration, add the discount widget to your theme:
        </s-paragraph>
        <s-ordered-list>
          <s-list-item>
            Go to Online Store → Themes → Customize
          </s-list-item>
          <s-list-item>
            Navigate to a product page
          </s-list-item>
          <s-list-item>
            Click "Add block" in the Product Information section
          </s-list-item>
          <s-list-item>
            Select "Volume Discount Widget" from Apps
          </s-list-item>
        </s-ordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
