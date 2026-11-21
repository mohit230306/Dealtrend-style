export type ProductStatus = 'Active' | 'Out of Stock' | 'Hidden';

export type PaymentMethod = 'COD' | 'Online';

export type PaymentStatus = 'Unpaid' | 'Pending' | 'Pending Verification' | 'Paid' | 'Refunded';

export type OrderStatus =
  | 'New'
  | 'Confirmed'
  | 'Processing'
  | 'Shipped'
  | 'Delivered'
  | 'Cancelled';

export interface ProductReview {
  id: string;
  reviewerName: string;
  rating: number;
  comment: string;
  dateLabel: string;
  verified?: boolean;
  images?: string[];
}

export interface ProductColorOption {
  name: string;
  imageIndex?: number;
}

export interface PublicProduct {
  id: string;
  productCode: string;
  name: string;
  category: string;
  images: string[];
  originalPrice: number;
  sellingPrice: number;
  onlinePrice?: number;
  discountPercent: number;
  description: string;
  availableStock: number;
  status: ProductStatus;
  reviews?: ProductReview[];
  reviewCount?: number;
  averageRating?: number;
  isSummary?: boolean;
  colorOptions?: ProductColorOption[];
  sizeOptions?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Product extends PublicProduct {
  sourceProductUrl: string;
  sourcePrice: number;
  expectedProfit: number;
}

export interface CartItem {
  cartKey?: string;
  productId: string;
  productCode: string;
  name: string;
  category: string;
  image: string;
  originalPrice: number;
  sellingPrice: number;
  onlinePrice?: number;
  quantity: number;
  availableStock: number;
  selectedColor?: string;
  selectedSize?: string;
}

export interface PublicOrderItem {
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  selectedColor?: string;
  selectedSize?: string;
}

export interface OrderItem extends PublicOrderItem {
  sourcePrice: number;
  sourceLineTotal: number;
  sourceProductUrl: string;
  itemExpectedProfit: number;
}

export interface PublicOrder {
  orderId: string;
  timestamp: string;
  customerName: string;
  mobileNumber: string;
  email: string;
  fullAddress: string;
  city: string;
  state: string;
  pincode: string;
  landmark: string;
  items: PublicOrderItem[];
  productNames: string;
  productCodes: string;
  quantity: number;
  subtotal: number;
  shippingFee: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  codAmount: number;
  orderStatus: OrderStatus;
  paymentReference?: string;
}

export interface Order extends PublicOrder {
  items: OrderItem[];
  sourceOrderAmount: number;
  expectedProfit: number;
  paymentProofImage?: string;
  appsScriptSyncStatus: 'Synced' | 'Pending' | 'Not Configured' | 'Failed';
  appsScriptSyncMessage?: string;
}

export interface PublicStoreSettings {
  storeName: string;
  storeDescription: string;
  logoUrl: string;
  heroImageUrl: string;
  currencySymbol: string;
  announcementText: string;
  codEnabled: boolean;
  onlinePaymentEnabled: boolean;
  upiId: string;
  paymentGatewayName: string;
  paymentGatewayNote: string;
  freeShippingThreshold: number;
  shippingFee: number;
  supportPhone: string;
  supportEmail: string;
  supportAddress: string;
}

export interface AdminStoreSettings extends PublicStoreSettings {
  appsScriptUrl: string;
  googleDriveFolderUrl: string;
  lastConnectionTestAt?: string;
  lastConnectionStatus?: 'Connected' | 'Failed' | 'Not Configured';
  lastConnectionMessage?: string;
}

export interface DashboardMetrics {
  totalOrders: number;
  newOrders: number;
  codOrders: number;
  onlinePaidOrders: number;
  pendingOrders: number;
  processingOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  totalCustomerSales: number;
  totalExpectedProfit: number;
  recentOrders: Order[];
}

export interface SupportMessage {
  id: string;
  name: string;
  mobileOrEmail: string;
  orderId?: string;
  message: string;
  createdAt: string;
}

export type ReturnRequestType = 'Return & Refund' | 'Replacement';

export type ReturnStatus =
  | 'Requested'
  | 'Approved'
  | 'Pickup Scheduled'
  | 'Picked Up'
  | 'Completed'
  | 'Rejected';

export type ReturnRefundStatus =
  | 'Not Applicable'
  | 'Pending'
  | 'Meesho Refund Received'
  | 'Refunded to Customer';

export interface PublicReturnRequest {
  trackingHash: string;
  orderId: string;
  customerName: string;
  requestType: ReturnRequestType;
  reason: string;
  details: string;
  maskedUpiId?: string;
  proofImages: string[];
  returnStatus: ReturnStatus;
  refundStatus: ReturnRefundStatus;
  meeshoReturnId?: string;
  pickupNote?: string;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReturnRequest extends Omit<PublicReturnRequest, 'maskedUpiId'> {
  customerUpiId?: string;
}

export type CancelRequestStatus = 'Requested' | 'Approved' | 'Rejected';

export interface PublicCancelRequest {
  trackingHash: string;
  orderId: string;
  customerName: string;
  reason: string;
  note: string;
  maskedUpiId?: string;
  cancelStatus: CancelRequestStatus;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CancelRequest extends Omit<PublicCancelRequest, 'maskedUpiId'> {
  customerUpiId?: string;
}

export type CustomerScreen =
  | 'home'
  | 'categories'
  | 'shop'
  | 'product'
  | 'cart'
  | 'checkout'
  | 'success'
  | 'track'
  | 'support';
