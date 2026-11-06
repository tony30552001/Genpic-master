const DAY_MS = 86400000;

export const getItemSeconds = (item) => item?.createdAt?.seconds || 0;

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const dayLabel = (day, today) => {
  const diffDays = Math.round((today - day) / DAY_MS);
  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  return new Intl.DateTimeFormat("zh-TW", {
    ...(day.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
    month: "long",
    day: "numeric",
  }).format(day);
};

/** 依日期（新到舊）分組；沒有時間的項目歸在「更早」。 */
export function groupByDay(items, now = new Date()) {
  const today = startOfDay(now);
  const groups = [];
  const byKey = new Map();

  [...items]
    .sort((a, b) => getItemSeconds(b) - getItemSeconds(a))
    .forEach((item) => {
      const seconds = getItemSeconds(item);
      const day = seconds ? startOfDay(new Date(seconds * 1000)) : null;
      const key = day ? String(day.getTime()) : "unknown";
      if (!byKey.has(key)) {
        const group = { key, label: day ? dayLabel(day, today) : "更早", items: [] };
        byKey.set(key, group);
        groups.push(group);
      }
      byKey.get(key).items.push(item);
    });

  return groups;
}

export function filterHistoryItems(items, query, styleMap = {}) {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  return items.filter((item) => {
    const seconds = getItemSeconds(item);
    const dateText = seconds
      ? new Intl.DateTimeFormat("zh-TW").format(new Date(seconds * 1000))
      : "";
    const style = item.styleId ? styleMap[item.styleId] : null;
    return [item.userScript, dateText, style?.name, ...(style?.tags || [])]
      .filter(Boolean)
      .some((text) => text.toLowerCase().includes(q));
  });
}
