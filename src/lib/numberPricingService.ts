export interface ResolvedPrice {
  price: number;
  isFree: boolean;
  isCustom: boolean;
  originalSalePrice: number;
  currency: string;
}

/**
 * Resolves the effective price a customer will see and pay for a number.
 * Gives reseller 100% control to make numbers FREE (৳0) or set any custom charge,
 * regardless of what rate/price the admin set.
 */
export function resolveCustomerNumberPrice(
  numberRecord: {
    salePrice?: any;
    resellerSalePrice?: any;
    isFreeForCustomer?: boolean | null;
    resellerId?: string | null;
    reseller?: {
      defaultNumberPricingMode?: string | null;
      defaultNumberPrice?: any;
    } | null;
  },
  resellerContext?: {
    defaultNumberPricingMode?: string | null;
    defaultNumberPrice?: any;
  } | null
): ResolvedPrice {
  const originalSalePrice = Number(numberRecord.salePrice || 0);
  const reseller = resellerContext || numberRecord.reseller;

  // 1. Explicit per-number free override by reseller
  if (numberRecord.isFreeForCustomer === true) {
    return {
      price: 0,
      isFree: true,
      isCustom: true,
      originalSalePrice,
      currency: "BDT",
    };
  }

  // 2. Explicit per-number custom selling price set by reseller
  if (
    numberRecord.resellerSalePrice !== null &&
    numberRecord.resellerSalePrice !== undefined
  ) {
    const custom = Number(numberRecord.resellerSalePrice);
    return {
      price: Math.max(0, custom),
      isFree: custom <= 0,
      isCustom: true,
      originalSalePrice,
      currency: "BDT",
    };
  }

  // 3. Reseller default portal pricing mode: All FREE
  if (reseller?.defaultNumberPricingMode === "FREE_ALL") {
    return {
      price: 0,
      isFree: true,
      isCustom: true,
      originalSalePrice,
      currency: "BDT",
    };
  }

  // 4. Reseller default portal pricing mode: Fixed Price
  if (
    reseller?.defaultNumberPricingMode === "FIXED_PRICE" &&
    reseller.defaultNumberPrice !== null &&
    reseller.defaultNumberPrice !== undefined
  ) {
    const fixed = Number(reseller.defaultNumberPrice);
    return {
      price: Math.max(0, fixed),
      isFree: fixed <= 0,
      isCustom: true,
      originalSalePrice,
      currency: "BDT",
    };
  }

  // 5. Default fallback to Admin's configured base sale price
  return {
    price: Math.max(0, originalSalePrice),
    isFree: originalSalePrice <= 0,
    isCustom: false,
    originalSalePrice,
    currency: "BDT",
  };
}
