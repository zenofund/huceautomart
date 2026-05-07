export function formatNaira(amount: number): string {
  // Use the Naira sign (U+20A6, double-stroke ₦) explicitly so the symbol
  // renders consistently across browsers/locales. Intl uses "NGN" or "₦"
  // depending on ICU data, so we format the number ourselves.
  return `\u20A6${new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

export function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString("en-NG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-NG").format(n);
}

export function formatMileage(km: number): string {
  return `${formatNumber(km)} km`;
}

export function timeAgo(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatDate(dateStr);
}
