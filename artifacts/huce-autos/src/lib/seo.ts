/**
 * Generates an SEO-friendly URL slug from a string.
 * Example: "2020 Toyota Camry XLE" -> "2020-toyota-camry-xle"
 */
export function generateSlug(text: string): string {
  if (!text) return "";
  
  return text
    .toString()
    .toLowerCase()
    .trim()
    // Replace spaces and special characters with hyphens
    .replace(/[\s_]+/g, "-")
    // Remove all non-word characters (except hyphens)
    .replace(/[^\w-]+/g, "")
    // Replace multiple hyphens with a single hyphen
    .replace(/--+/g, "-")
    // Remove trailing hyphens
    .replace(/^-+|-+$/g, "");
}

/**
 * Extracts the numeric ID from an SEO-friendly slug.
 * Example: "123-2020-toyota-camry" -> 123
 */
export function extractIdFromSlug(slugId: string | undefined): number {
  if (!slugId) return 0;
  
  // The ID is always the first part before the first hyphen
  const match = slugId.match(/^(\d+)/);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  
  // Fallback if it's just a number
  return parseInt(slugId, 10) || 0;
}
