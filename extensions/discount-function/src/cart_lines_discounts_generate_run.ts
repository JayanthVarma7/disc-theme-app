import {
  CartInput,
  CartLinesDiscountsGenerateRunResult,
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from "../generated/api";

type VolumeDiscountConfig = {
  products: string[];
  minQty: number;
  percentOff: number;
  widgetTemplate?: string;
};

export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  // Only run for product discount class; we don't create order-level discounts.
  const hasProductDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Product,
  );

  if (!hasProductDiscountClass) {
    return { operations: [] };
  }

  // Guard: no lines → nothing to do.
  if (!input.cart.lines.length) {
    return { operations: [] };
  }

  // Read config from shop metafield: volume_discount.rules
  const metafield = input.shop.metafield;

  if (!metafield?.value) {
    return { operations: [] };
  }

  let config: VolumeDiscountConfig | null = null;
  try {
    config = JSON.parse(metafield.value) as VolumeDiscountConfig;
  } catch {
    // Invalid JSON → fail safely with no discount.
    return { operations: [] };
  }

  if (
    !config ||
    !Array.isArray(config.products) ||
    typeof config.minQty !== "number" ||
    typeof config.percentOff !== "number" ||
    config.products.length === 0 ||
    config.percentOff <= 0
  ) {
    return { operations: [] };
  }

  const productIdSet = new Set(config.products);

  // Find cart lines that belong to configured products.
  const configuredLines = input.cart.lines.filter((line) => {
    const merchandise = line.merchandise.__typename === "ProductVariant"
      ? line.merchandise
      : null;
    const productId = merchandise?.product.id;

    if (!productId) return false;

    const isConfiguredProduct = productIdSet.has(productId);
    return isConfiguredProduct;
  });

  if (!configuredLines.length) {
    return { operations: [] };
  }

  const totalConfiguredQuantity = configuredLines.reduce(
    (total, line) => total + line.quantity,
    0,
  );

  if (totalConfiguredQuantity < config.minQty) {
    return { operations: [] };
  }

  const operations = [
    {
      productDiscountsAdd: {
        candidates: [
          {
            message: `Buy ${config.minQty}, get ${config.percentOff}% off`,
            targets: configuredLines.map((line) => ({
              cartLine: { id: line.id },
            })),
            value: {
              percentage: {
                value: config.percentOff,
              },
            },
          },
        ],
        // Apply the same percentage to all qualifying lines.
        selectionStrategy: ProductDiscountSelectionStrategy.All,
      },
    },
  ];

  return { operations };
}