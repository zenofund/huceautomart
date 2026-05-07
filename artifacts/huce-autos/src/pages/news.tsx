import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetNewsList } from "@workspace/api-client-react";
import { NewsCard } from "@/components/news-card";

const PAGE_SIZE = 9;

function formatDate(s?: string | null) {
  if (!s) return "";
  return new Date(s).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function NewsPage() {
  const { data: articles, isLoading } = useGetNewsList({ limit: 100 });

  const items = articles ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalPages, currentPage]);

  const pageItems = items.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const goTo = (p: number) => {
    if (p < 1 || p > totalPages) return;
    setCurrentPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <Layout>
      <SEO 
        title="Automotive News & Insights | HUCE Automart"
        description="Stay informed with the latest trends, tips, and insights from the world of cars and automotive trading in Nigeria."
        url="https://huceautomart.com/news"
        type="website"
      />
      {/* Page title hero */}
      <div className="bg-primary text-primary-foreground py-10">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold mb-1" data-testid="text-news-title">News</h1>
          <p className="text-primary-foreground/70 text-sm max-w-3xl">
            Stay informed with the latest trends, tips, and insights from the world of cars and automotive trading.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="aspect-[16/10] rounded-lg" />
                <Skeleton className="h-4 w-32 mt-4" />
                <Skeleton className="h-5 w-full mt-2" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-gray-500" data-testid="text-no-news">
            No news articles available yet. Check back soon.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
            {pageItems.map((a) => (
              <NewsCard
                key={a.id}
                href={`/news/${a.slug}`}
                title={a.title}
                excerpt={a.excerpt}
                content={a.content}
                imageUrl={a.imageUrl}
                author={a.authorName ?? "Admin"}
                date={formatDate(a.publishedAt ?? a.createdAt)}
                category="News"
                dataTestId={`card-news-${a.id}`}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {items.length > 0 && (
          <div className="flex items-center justify-between mt-12 border-t border-gray-200 pt-6">
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-md border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={currentPage === 1}
              onClick={() => goTo(currentPage - 1)}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }).map((_, i) => {
                const p = i + 1;
                const active = p === currentPage;
                return (
                  <button
                    key={p}
                    onClick={() => goTo(p)}
                    className={`w-9 h-9 rounded-md text-sm font-medium ${
                      active
                        ? "bg-primary text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                    data-testid={`button-page-${p}`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            <button
              className="flex items-center gap-2 px-4 py-2 rounded-md border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={currentPage === totalPages}
              onClick={() => goTo(currentPage + 1)}
              data-testid="button-next-page"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
