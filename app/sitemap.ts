import type { MetadataRoute } from "next";
import { absoluteUrl, PUBLIC_PAGES } from "../lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PUBLIC_PAGES.map((page) => ({
    url: absoluteUrl(page.path),
    lastModified: now,
    changeFrequency: page.changefreq || "monthly",
    priority: page.priority ?? 0.5,
  }));
}
