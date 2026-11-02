"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/** 押すと文章をコピーするボタン */
export function CopyButton({ text, label = "コピー" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      className="px-3 py-1 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          window.prompt("コピーしてください", text);
        }
      }}
    >
      {copied ? "コピーしました" : label}
    </Button>
  );
}
