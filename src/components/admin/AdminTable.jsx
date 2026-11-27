import { cn } from "@/lib/utils";

export default function AdminTable({ columns, minWidth, isEmpty, emptyMessage, footer, children }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className={cn("w-full text-sm", minWidth)}>
          <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              {columns.map((column) => {
                const { label, align } = typeof column === "string" ? { label: column } : column;
                return (
                  <th
                    key={label}
                    scope="col"
                    className={cn("whitespace-nowrap px-4 py-3 font-medium", align === "right" && "text-right")}
                  >
                    {label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">{children}</tbody>
        </table>
      </div>
      {isEmpty && (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      )}
      {footer}
    </div>
  );
}
