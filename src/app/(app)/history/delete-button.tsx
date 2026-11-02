import { SubmitButton } from "@/components/submit-button";
import { deleteHistory } from "./actions";

export function DeleteHistoryButton({ id }: { id: string }) {
  return (
    <form action={deleteHistory}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton
        variant="ghost"
        className="text-xs text-red-600"
        pendingText="削除中…"
        confirmMessage="この履歴を削除しますか？"
      >
        この履歴を削除
      </SubmitButton>
    </form>
  );
}
