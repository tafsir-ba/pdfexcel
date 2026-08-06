import React from "react";
import { Lock } from "lucide-react";

export const PrivacyBadge = ({ className = "", testId = "privacy-badge" }) => {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-2 rounded-full border border-grass/20 bg-grass-light px-3.5 py-1.5 text-xs font-semibold text-grass-hover ${className}`}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-grass opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-grass" />
      </span>
      <Lock className="h-3.5 w-3.5" strokeWidth={2.5} />
      100% Local · No Server Uploads
    </span>
  );
};
