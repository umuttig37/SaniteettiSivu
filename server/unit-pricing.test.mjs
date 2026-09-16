import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getCustomerUnitMultiplier,
  getSelectedUnitLabel,
  resolveCustomerUnitPrice,
} from './unit-pricing.mjs'

const product = {
  price: 1.79,
  optionGroups: [
    {
      id: 'unit',
      name: 'Yksikkö',
      values: [
        { id: 'roll', label: 'Rulla', detail: '1', price: 1.79 },
        { id: 'case', label: 'Laatikko', detail: '15', price: 26.85 },
        { id: 'pallet', label: 'Lava', detail: '600 rullaa', price: 1074 },
      ],
    },
  ],
}

const selectUnit = (valueId) => [{
  groupId: 'unit',
  groupName: 'Yksikkö',
  valueId,
  valueLabel: valueId,
}]

test('customer price is the smallest unit price for existing and new overrides', () => {
  assert.equal(resolveCustomerUnitPrice(product, selectUnit('roll'), 1.5), 1.5)
  assert.equal(resolveCustomerUnitPrice(product, selectUnit('case'), 1.5), 22.5)
  assert.equal(resolveCustomerUnitPrice(product, selectUnit('pallet'), 1.5), 900)
})

test('unit multiplier uses canonical catalog quantities rather than submitted details', () => {
  const tamperedSelection = [{
    ...selectUnit('case')[0],
    valueDetail: '1',
    valuePrice: 0.01,
  }]

  assert.equal(getCustomerUnitMultiplier(product, tamperedSelection), 15)
  assert.equal(resolveCustomerUnitPrice(product, tamperedSelection, 1.5), 22.5)
})

test('quantities are relative to the first option when its amount is not one', () => {
  const packageProduct = {
    optionGroups: [{
      id: 'package',
      name: 'Pakkaus',
      values: [
        { id: 'bundle', label: 'Nippu', detail: '10 kpl' },
        { id: 'case', label: 'Laatikko', detail: '150 kpl' },
      ],
    }],
  }

  assert.equal(getCustomerUnitMultiplier(packageProduct, [{
    groupId: 'package',
    groupName: 'Pakkaus',
    valueId: 'case',
    valueLabel: 'Laatikko',
  }]), 15)
})

test('selected unit labels come from canonical product data', () => {
  assert.equal(getSelectedUnitLabel(product, selectUnit('case')), 'Laatikko')
  assert.equal(getSelectedUnitLabel(product, selectUnit('unknown')), 'Rulla')
})

test('products without quantity-based unit options keep multiplier one', () => {
  const colorProduct = {
    optionGroups: [{
      id: 'color',
      name: 'Väri',
      values: [
        { id: 'white', label: 'Valkoinen', detail: 'Valkoinen' },
        { id: 'black', label: 'Musta', detail: 'Musta' },
      ],
    }],
  }

  assert.equal(getCustomerUnitMultiplier(colorProduct, [{
    groupId: 'color',
    groupName: 'Väri',
    valueId: 'black',
    valueLabel: 'Musta',
  }]), 1)
  assert.equal(resolveCustomerUnitPrice(colorProduct, [], 1.5), 1.5)
})
