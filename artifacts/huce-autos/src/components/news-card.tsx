import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";

interface NewsCardProps {
  title: string;
  excerpt?: string | null;
  content?: string | null;
  imageUrl?: string | null;
  href: string;
  category?: string;
  author?: string | null;
  date?: string | null;
  className?: string;
  dataTestId?: string;
}

function normalizeNewsText(text?: string | null): string {
  if (!text) return "";
  return text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildExcerpt(excerpt?: string | null, content?: string | null, maxLength = 100): string {
  const text = normalizeNewsText(excerpt) || normalizeNewsText(content);
  if (!text) return "";
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export function NewsCard({
  title,
  excerpt,
  content,
  imageUrl,
  href,
  category = "News",
  author,
  date,
  className,
  dataTestId,
}: NewsCardProps) {
  const preview = buildExcerpt(excerpt, content, 100);

  return (
    <article
      className={`group flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow ${className ?? ""}`}
      data-testid={dataTestId}
    >
      <Link href={href} className="block">
        <div className="aspect-[4/3] overflow-hidden bg-gray-100">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : null}
        </div>
      </Link>

      <div className="p-5">
        <span className="inline-block text-xs font-semibold text-primary bg-green-50 border border-green-100 rounded-full px-3 py-0.5 mb-3">
          {category}
        </span>

        <Link
          href={href}
          className="block font-bold text-gray-900 text-sm leading-snug mb-2 line-clamp-2 hover:text-primary transition-colors"
        >
          {title}
        </Link>

        <p className="text-gray-500 text-xs leading-relaxed mb-3 line-clamp-2 min-h-[32px]">{preview}</p>

        <Link href={href} className="text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1">
          View Details <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>

        {(author || date) && (
          <div className="flex items-center gap-3 text-xs text-gray-400 mt-3">
            {date ? <span>{date}</span> : null}
            {author ? (
              <span className="truncate">
                {date ? "• " : ""}
                {author}
              </span>
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}
