import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/layout";
import { Home, Search } from "lucide-react";

export default function NotFound() {
  return (
    <Layout>
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-9xl font-black text-primary/10 mb-4 select-none">404</div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Page Not Found</h1>
          <p className="text-muted-foreground mb-8">
            The page you are looking for does not exist or has been moved.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/">
              <Button className="bg-primary text-primary-foreground">
                <Home className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
            <Link href="/cars">
              <Button variant="outline">
                <Search className="h-4 w-4 mr-2" />
                Browse Cars
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
