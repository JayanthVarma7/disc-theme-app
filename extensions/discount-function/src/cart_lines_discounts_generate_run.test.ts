import { describe, it, expect } from "vitest";
import { cartLinesDiscountsGenerateRun } from "./cart_lines_discounts_generate_run";
import {
  ProductDiscountSelectionStrategy,
  DiscountClass,
  CartInput,
} from "../generated/api";

describe("cartLinesDiscountsGenerateRun", () => {
  it("returns empty operations when no discount classes are present", () => {
    const input: CartInput = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/1",
            quantity: 2,
            merchandise: {
              __typename: "ProductVariant",
              product: {
                id: "gid://shopify/Product/123",
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: [],
      },
      shop: {
        metafield: null,
      },
    };

    const result = cartLinesDiscountsGenerateRun(input);
    expect(result.operations).toHaveLength(0);
  });

  it("returns empty operations when product discount class is present but no metafield config", () => {
    const input: CartInput = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/1",
            quantity: 2,
            merchandise: {
              __typename: "ProductVariant",
              product: {
                id: "gid://shopify/Product/123",
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: [DiscountClass.Product],
      },
      shop: {
        metafield: null,
      },
    };

    const result = cartLinesDiscountsGenerateRun(input);
    expect(result.operations).toHaveLength(0);
  });

  it("returns empty operations when cart is empty", () => {
    const input: CartInput = {
      cart: {
        lines: [],
      },
      discount: {
        discountClasses: [DiscountClass.Product],
      },
      shop: {
        metafield: {
          value: JSON.stringify({
            products: ["gid://shopify/Product/123"],
            minQty: 2,
            percentOff: 10,
          }),
        },
      },
    };

    const result = cartLinesDiscountsGenerateRun(input);
    expect(result.operations).toHaveLength(0);
  });

  it("returns discount when product is configured and quantity meets minimum", () => {
    const input: CartInput = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/1",
            quantity: 2,
            merchandise: {
              __typename: "ProductVariant",
              product: {
                id: "gid://shopify/Product/123",
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: [DiscountClass.Product],
      },
      shop: {
        metafield: {
          value: JSON.stringify({
            products: ["gid://shopify/Product/123"],
            minQty: 2,
            percentOff: 10,
          }),
        },
      },
    };

    const result = cartLinesDiscountsGenerateRun(input);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({
      productDiscountsAdd: {
        candidates: [
          {
            message: "Buy 2, get 10% off",
            targets: [
              {
                cartLine: {
                  id: "gid://shopify/CartLine/1",
                },
              },
            ],
            value: {
              percentage: {
                value: 10,
              },
            },
          },
        ],
        selectionStrategy: ProductDiscountSelectionStrategy.All,
      },
    });
  });

  it("returns empty operations when quantity is below minimum", () => {
    const input: CartInput = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/1",
            quantity: 1,
            merchandise: {
              __typename: "ProductVariant",
              product: {
                id: "gid://shopify/Product/123",
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: [DiscountClass.Product],
      },
      shop: {
        metafield: {
          value: JSON.stringify({
            products: ["gid://shopify/Product/123"],
            minQty: 2,
            percentOff: 10,
          }),
        },
      },
    };

    const result = cartLinesDiscountsGenerateRun(input);
    expect(result.operations).toHaveLength(0);
  });

  it("returns empty operations when product is not in configured list", () => {
    const input: CartInput = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/1",
            quantity: 2,
            merchandise: {
              __typename: "ProductVariant",
              product: {
                id: "gid://shopify/Product/999",
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: [DiscountClass.Product],
      },
      shop: {
        metafield: {
          value: JSON.stringify({
            products: ["gid://shopify/Product/123"],
            minQty: 2,
            percentOff: 10,
          }),
        },
      },
    };

    const result = cartLinesDiscountsGenerateRun(input);
    expect(result.operations).toHaveLength(0);
  });

  it("applies discount when combined quantity across configured products meets minimum", () => {
    const input: CartInput = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/1",
            quantity: 1,
            merchandise: {
              __typename: "ProductVariant",
              product: {
                id: "gid://shopify/Product/123",
              },
            },
          },
          {
            id: "gid://shopify/CartLine/2",
            quantity: 1,
            merchandise: {
              __typename: "ProductVariant",
              product: {
                id: "gid://shopify/Product/456",
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: [DiscountClass.Product],
      },
      shop: {
        metafield: {
          value: JSON.stringify({
            products: [
              "gid://shopify/Product/123",
              "gid://shopify/Product/456",
            ],
            minQty: 2,
            percentOff: 20,
          }),
        },
      },
    };

    const result = cartLinesDiscountsGenerateRun(input);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({
      productDiscountsAdd: {
        candidates: [
          {
            message: "Buy 2, get 20% off",
            targets: [
              { cartLine: { id: "gid://shopify/CartLine/1" } },
              { cartLine: { id: "gid://shopify/CartLine/2" } },
            ],
            value: {
              percentage: { value: 20 },
            },
          },
        ],
        selectionStrategy: ProductDiscountSelectionStrategy.All,
      },
    });
  });

  it("applies discount to multiple qualifying lines", () => {
    const input: CartInput = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/1",
            quantity: 2,
            merchandise: {
              __typename: "ProductVariant",
              product: {
                id: "gid://shopify/Product/123",
              },
            },
          },
          {
            id: "gid://shopify/CartLine/2",
            quantity: 3,
            merchandise: {
              __typename: "ProductVariant",
              product: {
                id: "gid://shopify/Product/456",
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: [DiscountClass.Product],
      },
      shop: {
        metafield: {
          value: JSON.stringify({
            products: ["gid://shopify/Product/123", "gid://shopify/Product/456"],
            minQty: 2,
            percentOff: 15,
          }),
        },
      },
    };

    const result = cartLinesDiscountsGenerateRun(input);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({
      productDiscountsAdd: {
        candidates: [
          {
            message: "Buy 2, get 15% off",
            targets: [
              {
                cartLine: {
                  id: "gid://shopify/CartLine/1",
                },
              },
              {
                cartLine: {
                  id: "gid://shopify/CartLine/2",
                },
              },
            ],
            value: {
              percentage: {
                value: 15,
              },
            },
          },
        ],
        selectionStrategy: ProductDiscountSelectionStrategy.All,
      },
    });
  });

  it("handles invalid JSON in metafield gracefully", () => {
    const input: CartInput = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/1",
            quantity: 2,
            merchandise: {
              __typename: "ProductVariant",
              product: {
                id: "gid://shopify/Product/123",
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: [DiscountClass.Product],
      },
      shop: {
        metafield: {
          value: "invalid json",
        },
      },
    };

    const result = cartLinesDiscountsGenerateRun(input);
    expect(result.operations).toHaveLength(0);
  });
});
