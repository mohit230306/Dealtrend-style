# DealTrend Reseller Store — Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Reseller Isolation (Zero Leak)**: `admin_products` (`sourcePrice`, `expectedProfit`, `sourceProductUrl`, `Hidden` items) and `admin_settings` (`appsScriptUrl`, `googleDriveFolderUrl`) MUST ONLY be readable and writable by verified Admin (`nk4080294@gmail.com` or `/admins/$(uid)` with `email_verified == true`).
2. **Customer Storefront Isolation**: `public_store/config` and `public_products/{productId}` contain zero PII and zero reseller secrets; `public_products` strictly permits `status in ['Active', 'Out of Stock']` and never `'Hidden'`.
3. **PII Isolation on Orders**: `orders/{orderId}` contains customer PII (`customerName`, `mobileNumber`, `fullAddress`, `email`). Only Admin can `get`, `list`, `update`, or `delete` `orders`.
4. **Order Integrity at Checkout**: Guest `create` on `orders/{orderId}` MUST enforce `orderStatus == 'New'`, `paymentStatus == 'Unpaid'` (when `COD` with `codAmount == totalAmount`) or `paymentStatus == 'Pending Verification'` (when `Online` with `codAmount == 0`), `createdAt == request.time`, and `updatedAt == request.time`. A guest can never mark an order `Paid` or `Delivered`.
5. **Non-Enumerable Tracking**: `order_tracking/{trackingHash}` disables `list` completely (`allow list: if false`) and only permits single-doc `get` by valid SHA-256 ID without storing street addresses, phone numbers, or emails.
6. **Admin Privilege Escalation Guard**: `/admins/{userId}` forbids all client writes (`allow write: if false`). Bootstrapped admin requires both `request.auth.token.email == 'nk4080294@gmail.com'` AND `request.auth.token.email_verified == true`.
7. **Terminal State Locking**: Once an order reaches `Delivered` or `Cancelled`, updates are rejected unless performed by `isAdmin()`.
8. **Size & Type Bounds**: Every string and array validates types, min/max lengths, and `isValidId()` regex (`^[a-zA-Z0-9_\-]+$`) on document IDs to prevent resource exhaustion and ID poisoning.

## 2. The "Dirty Dozen" Attack Payloads
1. **Unverified Admin Email Spoof**: User with `email: 'nk4080294@gmail.com'` and `email_verified: false` tries to `get` `/admin_products/prod-1` -> **DENIED**.
2. **Non-Admin Reads Reseller Source Price**: Signed-in non-admin user tries to `list` `/admin_products` -> **DENIED**.
3. **Non-Admin Reads Apps Script URL**: Public/signed-in customer tries to `get` `/admin_settings/config` -> **DENIED**.
4. **Customer Lists All Orders (PII Scrape)**: Non-admin user tries to `list` `/orders` -> **DENIED**.
5. **Customer Reads Another Customer's Order**: Non-admin user tries to `get` `/orders/ORD-20261115-ABCD` -> **DENIED**.
6. **Guest Creates Pre-Paid Order**: Checkout payload sets `paymentMethod: 'Online'`, `paymentStatus: 'Paid'` -> **DENIED**.
7. **Guest Creates COD Order with Zero COD Amount**: Checkout payload sets `paymentMethod: 'COD'`, `totalAmount: 2799`, `codAmount: 0` -> **DENIED**.
8. **Shadow/Ghost Field Injection**: Order creation payload includes extra field `isAdminApproved: true` -> **DENIED** via `keys().hasOnly(...)`.
9. **ID Poisoning Attack**: Document ID contains 1KB string or invalid characters (`../../etc`) -> **DENIED** via `isValidId()`.
10. **Temporal Timestamp Forgery**: Payload supplies backdated `createdAt: "2020-01-01"` instead of server `request.time` -> **DENIED**.
11. **Privilege Escalation on Admins Collection**: Authenticated user tries to write `/admins/{theirUid}` -> **DENIED**.
12. **Hidden Product Publish Leak**: Write to `/public_products/prod-1` with `status: 'Hidden'` -> **DENIED**.
