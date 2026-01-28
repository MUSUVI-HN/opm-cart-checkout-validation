// @ts-check

/**
 * @typedef {import("../generated/api").CartValidationsGenerateRunInput} CartValidationsGenerateRunInput
 * @typedef {import("../generated/api").CartValidationsGenerateRunResult} CartValidationsGenerateRunResult
 */

// The configured entrypoint for the 'cart.validations.generate.run' extension target
/**
 * @param {CartValidationsGenerateRunInput} input
 * @returns {CartValidationsGenerateRunResult}
 */

export function cartValidationsGenerateRun(input) {
  // エラーを入れるための空の配列を用意
  const errors = [];

  input.cart.lines.forEach((line) => {
    const limitValue = line.merchandise.product?.metafield?.value;
    const limit = limitValue ? parseInt(limitValue) : null;

    const quantity = line.quantity;
    const title = line.merchandise.product?.title;

    if (limit != null && quantity > limit) {
      errors.push({
        message: `${title} is limited to ${limit} per customer.`,
        target: "cart"
      });
    }
  });

  // 最後に結果をShopifyに返す
  return {
    operations: [
      {
        validationAdd: {
          errors: errors
        }
      }
    ]
  };
}