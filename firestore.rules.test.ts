/**
 * Dirty Dozen Security Test Matrix for DealTrend Firestore Rules.
 * Verifies every attack vector documented in security_spec.md is rejected.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid?: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Unverified Admin Email Spoof on admin_products',
    collection: 'admin_products/prod-kettle-101',
    operation: 'get',
    auth: { uid: 'spoof-1', email: 'nk4080294@gmail.com', email_verified: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Non-Admin List admin_products',
    collection: 'admin_products',
    operation: 'list',
    auth: { uid: 'cust-1', email: 'customer@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Public Read on admin_settings',
    collection: 'admin_settings/config',
    operation: 'get',
    auth: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Non-Admin List orders PII',
    collection: 'orders',
    operation: 'list',
    auth: { uid: 'cust-1', email: 'customer@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Non-Admin Get single order PII',
    collection: 'orders/ORD-20261115-ABCD',
    operation: 'get',
    auth: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Guest Creates Pre-Paid Online Order',
    collection: 'orders/ORD-20261115-FAKE',
    operation: 'create',
    auth: null,
    payload: {
      orderId: 'ORD-20261115-FAKE',
      paymentMethod: 'Online',
      paymentStatus: 'Paid',
      orderStatus: 'New',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Guest Creates COD Order with Mismatched COD Amount',
    collection: 'orders/ORD-20261115-COD0',
    operation: 'create',
    auth: null,
    payload: {
      orderId: 'ORD-20261115-COD0',
      paymentMethod: 'COD',
      paymentStatus: 'Unpaid',
      totalAmount: 2799,
      codAmount: 0,
      orderStatus: 'New',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Shadow Ghost Field Injection on Order Create',
    collection: 'orders/ORD-20261115-SHDW',
    operation: 'create',
    auth: null,
    payload: {
      orderId: 'ORD-20261115-SHDW',
      isAdminApproved: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'ID Poisoning with Oversized Document ID',
    collection: `orders/${'A'.repeat(250)}`,
    operation: 'create',
    auth: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Client Timestamp Forgery on Order Create',
    collection: 'orders/ORD-20261115-TIME',
    operation: 'create',
    auth: null,
    payload: {
      orderId: 'ORD-20261115-TIME',
      createdAt: '2020-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Self-Assigned Privilege Escalation in admins Collection',
    collection: 'admins/cust-1',
    operation: 'create',
    auth: { uid: 'cust-1', email: 'attacker@example.com', email_verified: true },
    payload: { email: 'attacker@example.com' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Hidden Product Exposed in public_products',
    collection: 'public_products/prod-hidden',
    operation: 'create',
    auth: { uid: 'admin-1', email: 'nk4080294@gmail.com', email_verified: true },
    payload: { id: 'prod-hidden', status: 'Hidden' },
    expected: 'PERMISSION_DENIED',
  },
];
