import { useEffect } from "react";

interface SEOProps {
  title: string;
  description: string;
  image?: string;
  url?: string;
  type?: "website" | "article" | "product";
  schema?: Record<string, any>;
}

export function SEO({ title, description, image = "https://huceautomart.com/opengraph.jpg", url = "https://huceautomart.com", type = "website", schema }: SEOProps) {
  useEffect(() => {
    // Standard Metadata
    document.title = title;
    
    // Helper to set or create meta tags
    const setMetaTag = (name: string, content: string, attribute: "name" | "property" = "name") => {
      let element = document.querySelector(`meta[${attribute}="${name}"]`);
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, name);
        document.head.appendChild(element);
      }
      element.setAttribute("content", content);
    };

    // Primary Meta Tags
    setMetaTag("title", title);
    setMetaTag("description", description);

    // Open Graph / Facebook
    setMetaTag("og:type", type, "property");
    setMetaTag("og:url", url, "property");
    setMetaTag("og:title", title, "property");
    setMetaTag("og:description", description, "property");
    setMetaTag("og:image", image, "property");

    // Twitter
    setMetaTag("twitter:url", url, "property");
    setMetaTag("twitter:title", title, "property");
    setMetaTag("twitter:description", description, "property");
    setMetaTag("twitter:image", image, "property");

    // JSON-LD Schema
    let schemaScript = document.querySelector('script[type="application/ld+json"]');
    if (schema) {
      if (!schemaScript) {
        schemaScript = document.createElement("script");
        schemaScript.setAttribute("type", "application/ld+json");
        document.head.appendChild(schemaScript);
      }
      schemaScript.textContent = JSON.stringify(schema);
    } else if (schemaScript) {
      schemaScript.remove();
    }

  }, [title, description, image, url, type, schema]);

  return null;
}
