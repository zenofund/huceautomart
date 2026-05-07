import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowUpRight, Heart, Share2, MessageCircle, Mail, Copy, Check } from "lucide-react";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { AdSlot } from "@/components/ad-slot";
import { SEO } from "@/components/seo";
import {
  useGetNewsArticle,
  useGetNewsList,
} from "@workspace/api-client-react";

function formatDate(s?: string | null) {
  if (!s) return "";
  return new Date(s).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

import DOMPurify from "dompurify";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatInlineMarkup(raw: string) {
  let text = raw; // Allow HTML from Quill, DOMPurify handles sanitization
  
  // Convert newlines to <br/> only if it doesn't contain block HTML
  if (!/<[a-z][\s\S]*>/i.test(text)) {
    // If it's old markdown, let's wrap it in paragraph tags
    const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
    text = blocks.map(b => `<p>${b.replace(/\n/g, '<br/>')}</p>`).join('');
  }
  
  // Backwards compatibility for old markdown records
  text = text.replace(
    /&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g,
    "<u>$1</u>",
  );
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // Replace non-breaking spaces from rich text editors to allow proper word-wrapping
  text = text.replace(/&nbsp;/g, " ");
  // External links
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-primary hover:underline">$1</a>');
  // Internal links (e.g. to cars)
  text = text.replace(/\[([^\]]+)\]\((\/[^)]+)\)/g, '<a href="$2" class="text-primary hover:underline font-medium">$1</a>');
  
  return DOMPurify.sanitize(text);
}

export default function NewsDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { toast } = useToast();

  const { data: article, isLoading, isError } = useGetNewsArticle(slug);
  const { data: allArticles } = useGetNewsList({ limit: 20 });
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isLiking, setIsLiking] = useState(false);

  const articleTitle = article?.title ?? "News Article";
  const articleTags =
    (article?.tags ?? []).map((tag) => String(tag).trim()).filter(Boolean);
  const articleUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/news/${slug}`;
  }, [slug]);

  const likeBaseKey = `huce-news-like-v2:${slug}`;

  // Sync like count from backend on load
  useEffect(() => {
    if (article?.likesCount !== undefined) {
      setLikeCount(article.likesCount);
    }
  }, [article?.likesCount]);

  // Load local like state
  useEffect(() => {
    if (!slug) return;
    try {
      const savedLiked = localStorage.getItem(likeBaseKey) === "1";
      setLiked(savedLiked);
    } catch {
      setLiked(false);
    }
  }, [slug, likeBaseKey]);

  const toggleLike = async () => {
    if (isLiking) return;
    const nextLiked = !liked;
    const nextCount = nextLiked ? likeCount + 1 : Math.max(0, likeCount - 1);
    
    // Optimistic update
    setLiked(nextLiked);
    setLikeCount(nextCount);
    try {
      localStorage.setItem(likeBaseKey, nextLiked ? "1" : "0");
    } catch {}

    setIsLiking(true);
    try {
      const res = await fetch(`/api/news/${slug}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: nextLiked ? "like" : "unlike" }),
      });
      if (res.ok) {
        const data = await res.json();
        setLikeCount(data.likesCount);
      }
    } catch (err) {
      // Revert on failure
      setLiked(!nextLiked);
      setLikeCount(likeCount);
      try {
        localStorage.setItem(likeBaseKey, !nextLiked ? "1" : "0");
      } catch {}
      toast({ title: "Error", description: "Failed to update like status.", variant: "destructive" });
    } finally {
      setIsLiking(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(articleUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast({ title: "Link copied", description: "News link copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Could not copy link.", variant: "destructive" });
    }
  };

  const handleNativeShare = async () => {
    if (!articleUrl) return;
    if (!navigator.share) {
      setShareOpen(true);
      return;
    }
    try {
      await navigator.share({ title: articleTitle, text: articleTitle, url: articleUrl });
    } catch {
      // User dismissed or unsupported; keep silent.
    }
  };

  const related =
    (allArticles ?? []).filter((a) => a.slug !== slug).slice(0, 3);

  return (
    <Layout>
      {article && (
        <SEO 
          title={`${article.title} | HUCE Automart News`}
          description={article.excerpt || article.content?.substring(0, 155) + "..."}
          image={article.imageUrl || "https://huceautomart.com/opengraph.jpg"}
          url={articleUrl}
          type="article"
          schema={{
            "@context": "https://schema.org",
            "@type": "NewsArticle",
            "headline": article.title,
            "image": [
              article.imageUrl || "https://huceautomart.com/opengraph.jpg"
            ],
            "datePublished": article.publishedAt || article.createdAt,
            "dateModified": article.createdAt,
            "author": [{
                "@type": "Person",
                "name": article.authorName ?? "Admin"
            }],
            "keywords": articleTags.join(", "),
            "publisher": {
              "@type": "Organization",
              "name": "HUCE Automart",
              "logo": {
                "@type": "ImageObject",
                "url": "https://huceautomart.com/favicon.svg"
              }
            }
          }}
        />
      )}
      <article className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 mb-6" data-testid="breadcrumb-news-detail">
          <Link href="/" className="hover:text-gray-900">Home</Link>
          <span className="mx-1">/</span>
          <Link href="/news" className="hover:text-gray-900">News</Link>
        </nav>

        {isLoading ? (
          <div>
            <Skeleton className="h-10 w-3/4 mb-3" />
            <Skeleton className="h-4 w-64 mb-8" />
            <Skeleton className="aspect-[16/9] rounded-xl" />
            <div className="space-y-3 mt-8">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
        ) : isError || !article ? (
          <div className="text-center py-20 text-gray-500" data-testid="text-news-not-found">
            Article not found.
            <div className="mt-4">
              <Link href="/news" className="text-primary hover:underline">
                ← Back to news
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Title */}
            <h1
              className="text-3xl md:text-4xl font-black text-gray-900 leading-tight mb-3"
              data-testid="text-article-title"
            >
              {article.title}
            </h1>

            {/* Byline */}
            <p className="text-sm text-gray-500 mb-8" data-testid="text-article-meta">
              <span className="font-medium text-gray-700">
                {article.authorName ?? "Admin"}
              </span>
              <span className="mx-2">•</span>
              <span>{articleTags.length > 0 ? articleTags.join(", ") : "General"}</span>
              <span className="mx-2">•</span>
              <span>{formatDate(article.publishedAt ?? article.createdAt)}</span>
            </p>

            <AdSlot basePlacement="news_detail_top" className="mb-8" imageClassName="h-[100px] md:h-[90px] lg:h-[120px]" />

            {/* Engagement actions */}
            <div className="flex flex-wrap items-center gap-2 mb-8" data-testid="news-engagement-actions">
              <button
                type="button"
                onClick={toggleLike}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                  liked
                    ? "border-rose-200 bg-rose-50 text-rose-600"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
                aria-label={liked ? "Unlike article" : "Like article"}
              >
                <Heart className={`h-4 w-4 ${liked ? "fill-rose-500 text-rose-500" : ""}`} />
                <span>Like</span>
                <span className="text-xs rounded-full bg-black/5 px-2 py-0.5">{likeCount}</span>
              </button>

              <Popover open={shareOpen} onOpenChange={setShareOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={() => void handleNativeShare()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
                    aria-label="Share article"
                  >
                    <Share2 className="h-4 w-4" />
                    Share
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-52 p-2">
                  <p className="text-xs font-semibold text-muted-foreground px-2 pb-2">Share this news</p>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`${articleTitle} – ${articleUrl}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setShareOpen(false)}
                    className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted text-sm transition-colors w-full"
                  >
                    <MessageCircle className="h-4 w-4 text-green-600 shrink-0" />
                    WhatsApp
                  </a>
                  <a
                    href={`mailto:?subject=${encodeURIComponent(articleTitle)}&body=${encodeURIComponent(`Check out this news on HUCE Autos:\n${articleUrl}`)}`}
                    onClick={() => setShareOpen(false)}
                    className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted text-sm transition-colors w-full"
                  >
                    <Mail className="h-4 w-4 text-blue-500 shrink-0" />
                    Email
                  </a>
                  <button
                    onClick={() => { void handleCopy(); setShareOpen(false); }}
                    className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted text-sm transition-colors w-full text-left"
                  >
                    {copied
                      ? <Check className="h-4 w-4 text-green-600 shrink-0" />
                      : <Copy className="h-4 w-4 text-gray-500 shrink-0" />
                    }
                    {copied ? "Copied!" : "Copy link"}
                  </button>
                </PopoverContent>
              </Popover>
            </div>

            {/* Hero image */}
            {article.imageUrl && (
              <div className="aspect-[16/9] overflow-hidden rounded-xl bg-gray-100 mb-10">
                <img
                  src={article.imageUrl}
                  alt={article.title}
                  className="w-full h-full object-cover"
                  data-testid="img-article-hero"
                />
              </div>
            )}

            {/* Content */}
            <div
              className="prose prose-gray max-w-none text-gray-700 leading-relaxed break-words whitespace-pre-wrap"
              data-testid="text-article-content"
              dangerouslySetInnerHTML={{ __html: formatInlineMarkup(article.content ?? article.excerpt ?? "") }}
            />

            <AdSlot basePlacement="news_detail_mid" className="mt-8" imageClassName="h-[220px] md:h-[250px]" />

            {/* Related */}
            {related.length > 0 && (
              <section className="mt-16 pt-10 border-t border-gray-200">
                <h2 className="text-2xl font-black text-gray-900 mb-6" data-testid="text-related-title">
                  Related Post
                </h2>
                <div
                  className="
                    flex sm:grid sm:grid-cols-2 lg:grid-cols-3
                    gap-x-4 sm:gap-x-6 gap-y-10
                    overflow-x-auto sm:overflow-visible
                    snap-x snap-mandatory sm:snap-none
                    -mx-4 px-4 sm:mx-0 sm:px-0
                    pb-4 sm:pb-0
                    no-scrollbar
                  "
                >
                  {related.map((a) => (
                    <article
                      key={a.id}
                      className="group flex flex-col flex-shrink-0 sm:flex-shrink w-[80%] sm:w-auto snap-start"
                      data-testid={`card-related-${a.id}`}
                    >
                      <Link href={`/news/${a.slug}`}>
                        <div className="relative aspect-[16/10] overflow-hidden rounded-lg bg-gray-100">
                          {a.imageUrl ? (
                            <img
                              src={a.imageUrl}
                              alt={a.title}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : null}
                          <span className="absolute top-3 left-3 bg-white/95 text-gray-900 text-xs font-medium px-3 py-1 rounded-full shadow-sm">
                            Sound
                          </span>
                        </div>
                      </Link>
                      <div className="mt-4">
                        <p className="text-xs text-gray-500 mb-2">
                          <span className="font-medium text-gray-700">{a.authorName ?? "Admin"}</span>
                          <span className="mx-2">•</span>
                          <span>{formatDate(a.publishedAt ?? a.createdAt)}</span>
                        </p>
                        <div className="flex items-start justify-between gap-3">
                          <Link
                            href={`/news/${a.slug}`}
                            className="text-base font-bold text-gray-900 leading-snug line-clamp-2 hover:text-primary transition-colors flex-1"
                          >
                            {a.title}
                          </Link>
                          <Link
                            href={`/news/${a.slug}`}
                            className="flex items-center gap-1 text-sm font-medium text-primary whitespace-nowrap mt-0.5 hover:underline"
                          >
                            View Details
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </article>
    </Layout>
  );
}
