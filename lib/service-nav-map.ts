// A sidebar item is hidden when its service key is present here AND that
// service is not active for this project. Items/hrefs not listed here are
// always shown (when the account has access at all). "/plan" must NEVER be
// gated — it's how a blocked/limited account manages their situation.
export const SERVICE_NAV_HREFS: Record<string, string[]> = {
  web_orders: ["/", "/historial", "/clientes", "/rendimiento"],
  // stock_management and ticket_printing currently gate no visible page —
  // stock has no UI yet, ticket printing is a background service.
};
