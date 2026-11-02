// データベースの「形」をプログラムに教えるための型定義です。
// supabase/migrations のSQLを変更したら、ここも合わせて更新してください。
// （Supabase CLI の `supabase gen types typescript` で自動生成したものに置き換えても構いません）

export type UserStatus = "pending" | "approved" | "suspended";
export type AiProvider = "anthropic" | "openai" | "gemini";

type Timestamps = { created_at: string; updated_at: string };

export type ProfileRow = {
  id: string;
  email: string;
  display_name: string;
  brain_name: string;
  status: UserStatus;
  is_admin: boolean;
  passphrase_verified: boolean;
  access_expires_at: string | null;
  admin_note: string;
  preferred_ai_provider: AiProvider | null;
  approved_at: string | null;
} & Timestamps;

export type AppSettingsRow = {
  id: boolean;
  signup_passphrase_hash: string | null;
  updated_at: string;
};

export type ManagedAccountRow = {
  id: string;
  user_id: string;
  name: string;
  threads_username: string;
  profile_summary: string;
  target_audience: string;
  goal: string;
  writing_style: string;
  style_samples: string;
  banned_expressions: string[];
  custom_rules: string;
} & Timestamps;

export type KnowledgeItemRow = {
  id: string;
  user_id: string;
  account_id: string;
  title: string;
  content: string;
} & Timestamps;

export type AiCredentialRow = {
  id: string;
  user_id: string;
  provider: AiProvider;
  encrypted_key: string;
  key_hint: string;
  model: string;
  available_models: string[];
  verified_at: string | null;
} & Timestamps;

type Table<Row, Required extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, "id">;
      app_settings: Table<AppSettingsRow>;
      managed_accounts: Table<ManagedAccountRow, "name">;
      knowledge_items: Table<KnowledgeItemRow, "account_id" | "title" | "content">;
      ai_credentials: Table<
        AiCredentialRow,
        "provider" | "encrypted_key" | "key_hint"
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      is_active_user: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: {
      user_status: UserStatus;
      ai_provider: AiProvider;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
