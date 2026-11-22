'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const pricing = require('../lib/pricing');
const invoice = require('../lib/invoice');
const reports = require('../lib/reports');

function billedOrder(items, coupon) {
  const totals = pricing.computeTotals(items, coupon || '');
  return {
    id: 1001,
    date: '22/11/2026',
    customer: 'In-memory customer',
    paymentMode: 'cash',
    status: 'completed',
    items: items,
    coupon: coupon || '',
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('invoice GST breakdown and total match the values billed at order placement', function () {
  const order = billedOrder([
    { id: 1, name: 'Rice', sku: 'GRN-001', hsn: '1006', price: 640, qty: 1 }
  ], 'SAVE10');

  const billed = pricing.computeTotals(order.items, order.coupon);
  const printed = invoice.computeInvoiceFigures(order);

  assert.equal(printed.subtotal, billed.subtotal);
  assert.equal(printed.discount, billed.discount);
  assert.equal(printed.tax, billed.tax);
  assert.equal(printed.total, billed.total);
  assert.equal(printed.rows[0].gstPercent, billed.lines[0].gstPercent);
  assert.equal(printed.rows[0].lineTax, billed.lines[0].tax);
});

test('invoice uses the HSN GST slab when the order line has no stored gstRate', function () {
  const order = billedOrder([
    { id: 1, name: 'Rice', sku: 'GRN-001', hsn: '1006', price: 100, qty: 1 }
  ]);

  const billed = pricing.computeTotals(order.items, order.coupon);
  const printed = invoice.computeInvoiceFigures(order);

  assert.equal(billed.tax, 5);
  assert.equal(billed.total, 105);
  assert.equal(printed.rows[0].gstPercent, 5);
  assert.equal(printed.tax, 5);
  assert.equal(printed.total, 105);
});

test('SAVE10 invoice discount, GST, and total match the values computed at billing', function () {
  const order = billedOrder([
    { id: 1, name: 'Rice', sku: 'GRN-001', hsn: '1006', price: 100, qty: 6 }
  ], 'SAVE10');

  const printed = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    { subtotal: printed.subtotal, discount: printed.discount, tax: printed.tax, total: printed.total },
    { subtotal: order.subtotal, discount: order.discount, tax: order.tax, total: order.total }
  );
  assert.deepEqual(
    { subtotal: printed.subtotal, discount: printed.discount, tax: printed.tax, total: printed.total },
    { subtotal: 600, discount: 60, tax: 27, total: 567 }
  );
});

test('GST reconciliation reports matching invoice and ledger totals for an in-memory order', function () {
  const order = billedOrder([
    { id: 1, name: 'Rice', sku: 'GRN-001', hsn: '1006', price: 100, qty: 6 }
  ], 'SAVE10');
  const memoryOnlyDb = { orders: [order], products: [], customers: [], settlements: [] };

  const result = reports.getGstReconciliation(memoryOnlyDb);

  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.rows[0].ledgerTotal, 567);
  assert.equal(result.rows[0].invoiceTotal, 567);
  assert.equal(result.rows[0].delta, 0);
  assert.equal(result.rows[0].matched, true);
  assert.equal(result.totalDelta, 0);
});

test('invoice discount for an inactive coupon matches billing calculation', function () {
  const order = billedOrder([
    { id: 1, name: 'Rice', sku: 'GRN-001', hsn: '1006', price: 100, qty: 1 }
  ]);
  order.coupon = 'DIWALI20';

  const billed = pricing.computeTotals(order.items, order.coupon);
  const printed = invoice.computeInvoiceFigures(order);

  assert.equal(billed.discount, 0);
  assert.equal(printed.discount, 0);
  assert.equal(printed.tax, billed.tax);
  assert.equal(printed.total, billed.total);
});
