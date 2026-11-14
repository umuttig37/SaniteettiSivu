export const DEFAULT_VAT_RATE = 25.5

const toFiniteNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export const getDefaultSelectedOptionPrice = (product) => {
  const groups = Array.isArray(product?.optionGroups) ? product.optionGroups : []

  for (const group of groups) {
    const selectedValue = Array.isArray(group?.values) ? group.values[0] : null
    if (toFiniteNumber(selectedValue?.price) !== null) {
      return Number(selectedValue.price)
    }
  }

  return Number(product?.price ?? 0)
}

export const getProductVatRate = (product) => {
  const configuredRate = [product?.vatRate, product?.vatPercentage, product?.taxRate]
    .map(toFiniteNumber)
    .find((rate) => rate !== null && rate >= 0 && rate <= 100)

  return configuredRate ?? DEFAULT_VAT_RATE
}

export const getGrossProductPrice = (netPrice, product) => {
  const numericNetPrice = toFiniteNumber(netPrice)
  if (numericNetPrice === null) {
    return 0
  }

  const netMinorUnits = Math.round((numericNetPrice + Number.EPSILON) * 100)
  const vatBasisPoints = Math.round(getProductVatRate(product) * 100)
  const grossMinorUnits = Math.round((netMinorUnits * (10_000 + vatBasisPoints)) / 10_000)
  return grossMinorUnits / 100
}

export const getDefaultGrossProductPrice = (product) =>
  getGrossProductPrice(getDefaultSelectedOptionPrice(product), product)
