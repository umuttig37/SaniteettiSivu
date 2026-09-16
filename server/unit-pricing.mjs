const isUnitGroup = (name) => /yksikk|unit/i.test(String(name ?? ''))

const parseQuantity = (detail) => {
  const match = String(detail ?? '')
    .replace(/\s+/g, '')
    .match(/\d+(?:[.,]\d+)?/)
  if (!match) {
    return null
  }

  const quantity = Number(match[0].replace(',', '.'))
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null
}

const getUnitGroup = (product) => {
  const groups = Array.isArray(product?.optionGroups) ? product.optionGroups : []
  const namedUnitGroup = groups.find((group) => isUnitGroup(group?.name))
  if (namedUnitGroup) {
    return namedUnitGroup
  }

  if (groups.length === 1) {
    const [onlyGroup] = groups
    const values = Array.isArray(onlyGroup?.values) ? onlyGroup.values : []
    if (values.length > 1 && values.every((value) => parseQuantity(value?.detail) !== null)) {
      return onlyGroup
    }
  }

  return null
}

export const getCustomerUnitMultiplier = (product, selectedOptions) => {
  const unitGroup = getUnitGroup(product)
  const values = Array.isArray(unitGroup?.values) ? unitGroup.values : []
  const baseValue = values[0]
  if (!unitGroup || !baseValue) {
    return 1
  }

  const selections = Array.isArray(selectedOptions) ? selectedOptions : []
  const selection = selections.find((item) => (
    String(item?.groupId ?? '') === String(unitGroup.id ?? '')
    || String(item?.groupName ?? '').trim().toLowerCase() === String(unitGroup.name ?? '').trim().toLowerCase()
  ))
  const selectedValue = values.find((value) => String(value?.id ?? '') === String(selection?.valueId ?? '')) ?? baseValue
  const baseQuantity = parseQuantity(baseValue.detail) ?? 1
  const selectedQuantity = parseQuantity(selectedValue.detail) ?? baseQuantity

  return selectedQuantity / baseQuantity
}

export const resolveCustomerUnitPrice = (product, selectedOptions, customerPrice) => {
  const price = Number(customerPrice)
  if (!Number.isFinite(price)) {
    return null
  }

  return Math.round((price * getCustomerUnitMultiplier(product, selectedOptions) + Number.EPSILON) * 100) / 100
}

export const getSelectedUnitLabel = (product, selectedOptions) => {
  const unitGroup = getUnitGroup(product)
  const values = Array.isArray(unitGroup?.values) ? unitGroup.values : []
  if (!unitGroup || values.length === 0) {
    return ''
  }

  const selections = Array.isArray(selectedOptions) ? selectedOptions : []
  const selection = selections.find((item) => (
    String(item?.groupId ?? '') === String(unitGroup.id ?? '')
    || String(item?.groupName ?? '').trim().toLowerCase() === String(unitGroup.name ?? '').trim().toLowerCase()
  ))
  const selectedValue = values.find((value) => String(value?.id ?? '') === String(selection?.valueId ?? '')) ?? values[0]
  return String(selectedValue?.label ?? '').trim()
}
