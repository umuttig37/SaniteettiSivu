import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getDefaultGrossProductPrice,
  getDefaultSelectedOptionPrice,
  getGrossProductPrice,
  getProductVatRate,
} from './product-pricing.mjs'

test('default product price follows the first option selected on the product page', () => {
  const product = {
    price: 10,
    optionGroups: [
      {
        name: 'Unit',
        values: [
          { label: 'Package', price: 12 },
          { label: 'Case', price: 48 },
        ],
      },
    ],
  }

  assert.equal(getDefaultSelectedOptionPrice(product), 12)
  assert.equal(getDefaultGrossProductPrice(product), 15.06)
})

test('an unselected later option cannot override the default product price', () => {
  const product = {
    price: 10,
    optionGroups: [
      {
        name: 'Unit',
        values: [
          { label: 'Default package' },
          { label: 'Larger package', price: 48 },
        ],
      },
    ],
  }

  assert.equal(getDefaultSelectedOptionPrice(product), 10)
})

test('products without options use the stored base price', () => {
  const product = { price: 10, optionGroups: [] }

  assert.equal(getDefaultSelectedOptionPrice(product), 10)
  assert.equal(getDefaultGrossProductPrice(product), 12.55)
})

test('gross prices use a product tax rate when one is available', () => {
  const product = { price: 12, vatRate: 14 }

  assert.equal(getProductVatRate(product), 14)
  assert.equal(getDefaultGrossProductPrice(product), 13.68)
})

test('gross price rounding is stable at half-cent boundaries', () => {
  assert.equal(getGrossProductPrice(1, { price: 1 }), 1.26)
  assert.equal(getGrossProductPrice(99, { price: 99 }), 124.25)
})
