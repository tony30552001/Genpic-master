export const VIEW_MODE_OPTIONS = [
  { id: "grid", label: "網格", icon: "Grid2X2" },
  { id: "list", label: "條列", icon: "List" },
  { id: "table", label: "表格", icon: "Table2" },
];

export const normalizeViewMode = (value) =>
  VIEW_MODE_OPTIONS.some((option) => option.id === value) ? value : "table";
