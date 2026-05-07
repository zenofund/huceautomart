import { Link } from "wouter";
import { motion } from "framer-motion";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <div
        className="hidden lg:block flex-1 relative"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=1200&q=80')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/95 to-primary/70" />
        <div className="relative flex flex-col h-full p-10 justify-between">
          <Link href="/" className="inline-flex">
            <img
              src={`${import.meta.env.BASE_URL}huce-automart-logo.png`}
              alt="Huce Auto Mart"
              className="h-10 w-auto"
            />
          </Link>
          <div>
            <blockquote className="text-white/90 text-xl italic font-medium leading-relaxed mb-4">
              "Nigeria's most trusted car marketplace — connecting serious
              buyers with verified sellers."
            </blockquote>
            <p className="text-primary-foreground/70 text-sm">
              Drive with Confidence
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-16 bg-background">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8 lg:hidden">
            <Link href="/" className="inline-flex mb-4">
              <img
                src={`${import.meta.env.BASE_URL}huce-automart-logo.png`}
                alt="Huce Auto Mart"
                className="h-10 w-auto"
              />
            </Link>
          </div>
          {children}
        </motion.div>
      </div>
    </div>
  );
}
