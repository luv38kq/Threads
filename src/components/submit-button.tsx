"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui";

/** 送信中は押せなくなり、文言が変わるボタン（二重送信を防ぐ） */
export function SubmitButton({
  children,
  pendingText = "処理中…",
  confirmMessage,
  ...props
}: ComponentProps<typeof Button> & {
  pendingText?: string;
  /** 指定すると、押したときに確認ダイアログを出す */
  confirmMessage?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || props.disabled}
      onClick={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) e.preventDefault();
      }}
      {...props}
    >
      {pending ? pendingText : children}
    </Button>
  );
}
