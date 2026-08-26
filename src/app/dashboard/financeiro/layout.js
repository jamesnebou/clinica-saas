import { FinanceNav } from "./finance-nav";

export default function FinanceLayout({ children }) {
  return <div className="min-w-0"><FinanceNav />{children}</div>;
}
