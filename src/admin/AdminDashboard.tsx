import { ArrowRight, MessageSquare } from 'lucide-react';
import type { DashboardMetrics, Order } from '../types';
import { formatDateTime, formatPrice } from '../utils/format';

interface AdminDashboardProps {
  metrics: DashboardMetrics | null;
  currencySymbol: string;
  openTicketsCount?: number;
  onViewAllOrders: () => void;
  onViewTickets?: () => void;
}

export function AdminDashboard({
  metrics,
  currencySymbol,
  openTicketsCount = 0,
  onViewAllOrders,
  onViewTickets,
}: AdminDashboardProps) {
  const safeMetrics: DashboardMetrics = metrics || {
    totalOrders: 0,
    newOrders: 0,
    codOrders: 0,
    onlinePaidOrders: 0,
    pendingOrders: 0,
    processingOrders: 0,
    deliveredOrders: 0,
    cancelledOrders: 0,
    totalCustomerSales: 0,
    totalExpectedProfit: 0,
    recentOrders: [],
  };

  const primaryFinancials = [
    {
      label: 'Total Customer Sales',
      value: formatPrice(safeMetrics.totalCustomerSales, currencySymbol),
      accent: 'text-[#0B3B6D]',
    },
    {
      label: 'Expected Reseller Profit',
      value: formatPrice(safeMetrics.totalExpectedProfit, currencySymbol),
      accent: 'text-[#15803D]',
    },
    {
      label: 'Total Orders',
      value: String(safeMetrics.totalOrders),
      accent: 'text-[#0F172A]',
    },
    {
      label: 'COD Orders',
      value: String(safeMetrics.codOrders),
      accent: 'text-[#0F172A]',
    },
    {
      label: 'Online Paid Orders',
      value: String(safeMetrics.onlinePaidOrders),
      accent: 'text-[#0B3B6D]',
    },
  ];

  const orderBreakdown = [
    { label: 'New Orders', value: safeMetrics.newOrders },
    { label: 'Pending Orders', value: safeMetrics.pendingOrders },
    { label: 'Processing Orders', value: safeMetrics.processingOrders },
    { label: 'Delivered Orders', value: safeMetrics.deliveredOrders },
    { label: 'Cancelled Orders', value: safeMetrics.cancelledOrders },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#0F172A]">
          Reseller Dashboard
        </h1>
        <p className="text-sm text-[#475569] mt-1">
          Customer sales, expected reseller profit, COD tracking, and order status breakdown.
        </p>
      </div>

      {openTicketsCount > 0 && onViewTickets && (
        <div className="bg-[#F0F7FF] border border-[#0B3B6D]/25 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0B3B6D] text-white flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#0F172A]">
                {openTicketsCount} Customer Support Ticket{openTicketsCount === 1 ? '' : 's'} waiting
              </p>
              <p className="text-xs text-[#475569]">
                Customers have raised support requests from the Storefront Support page.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onViewTickets}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-[#0B3B6D] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-[#082D54] shrink-0"
          >
            <span>View Tickets</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Primary Revenue & Order Volume KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {primaryFinancials.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-1.5"
          >
            <p className="text-xs font-medium text-[#64748B]">{kpi.label}</p>
            <p className={`text-2xl font-semibold tabular-nums ${kpi.accent}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Order Status Breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {orderBreakdown.map((item) => (
          <div
            key={item.label}
            className="bg-[#F1F5F9] border border-[#E2E8F0] rounded-xl px-4 py-3.5 flex items-center justify-between gap-2"
          >
            <span className="text-xs font-medium text-[#475569]">{item.label}</span>
            <span className="text-lg font-semibold text-[#0F172A] tabular-nums">{item.value}</span>
          </div>
        ))}
      </div>

      {/* Recent Orders */}
      <section className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between gap-4">
          <h2 className="font-editorial text-lg font-semibold text-[#0F172A]">
            Recent Orders
          </h2>
          <button
            type="button"
            onClick={onViewAllOrders}
            className="text-xs font-semibold text-[#0B3B6D] inline-flex items-center gap-1 hover:underline"
          >
            <span>Manage all orders</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {safeMetrics.recentOrders.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#475569]">
            No orders have been placed yet. New customer orders will appear here with expected reseller profit.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-semibold text-[#475569]">
                <tr>
                  <th className="py-3 px-4">Order ID</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Products &amp; Code</th>
                  <th className="py-3 px-4">Customer Amt</th>
                  <th className="py-3 px-4">Source Amt</th>
                  <th className="py-3 px-4">Expected Profit</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {safeMetrics.recentOrders.map((order: Order) => (
                  <tr key={order.orderId} className="hover:bg-[#F8FAFC]">
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="font-mono text-xs font-semibold text-[#0F172A]">
                        {order.orderId}
                      </span>
                      <span className="block text-[11px] text-[#64748B]">
                        {formatDateTime(order.timestamp)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="font-medium text-[#0F172A]">{order.customerName}</span>
                      <span className="block text-xs text-[#64748B] tabular-nums">
                        {order.mobileNumber}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <span className="text-xs text-[#0F172A] line-clamp-1">
                        {order.productNames}
                      </span>
                      <span className="block text-[11px] font-mono text-[#64748B]">
                        {order.productCodes}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap font-semibold tabular-nums">
                      {formatPrice(order.totalAmount, currencySymbol)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-xs text-[#475569] tabular-nums">
                      {formatPrice(order.sourceOrderAmount || 0, currencySymbol)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-xs font-semibold text-[#15803D] tabular-nums">
                      +{formatPrice(order.expectedProfit || 0, currencySymbol)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                      <span className="font-medium text-[#0F172A]">{order.paymentMethod}</span>
                      <span className="block text-[#64748B]">{order.paymentStatus}</span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-xs font-semibold text-[#0B3B6D]">
                      {order.orderStatus}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
