export const forceGuestCardCheckout = (checkout, companyName) => ({
  ...checkout,
  paymentMethod: 'card',
  billingCompany: String(companyName ?? '').trim(),
  billingAddress: { ...checkout.deliveryAddress },
  eInvoiceAddress: '',
})
