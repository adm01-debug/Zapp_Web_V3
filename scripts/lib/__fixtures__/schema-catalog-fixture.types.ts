export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  zapp: {
    Tables: {}
    Views: {
      contacts: {
        Row: {
          id: string | null
          name: string | null
          phone: string | null
          last_seen_at: string | null
          workspace_id: string | null
        }
        Insert: {
          id?: string | null
          name?: never
          phone?: never
          last_seen_at?: string | null
          workspace_id?: never
        }
        Update: {
          id?: string | null
          name?: never
          phone?: never
          last_seen_at?: string | null
          workspace_id?: never
        }
        Relationships: []
      }
      gmail_accounts: {
        Row: {
          history_id: string | null
          token_expires_at: string | null
          watch_expiration: string | null
        }
        Insert: {
          history_id?: string | null
          token_expires_at?: string | null
          watch_expiration?: string | null
        }
        Update: {
          history_id?: string | null
          token_expires_at?: string | null
          watch_expiration?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      current_user_role: { Args: never; Returns: string }
      decrypt_gmail_token: { Args: { p_encrypted: string }; Returns: string }
      encrypt_gmail_token: { Args: { p_token: string }; Returns: string }
      get_own_gmail_accounts: {
        Args: never
        Returns: Database["zapp"]["Views"]["gmail_accounts"]["Row"][]
        SetofOptions: {
          from: "*"
          to: "gmail_accounts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_get_gmail_health_summary:
        | { Args: never; Returns: Json }
        | { Args: { p_window_minutes?: number }; Returns: Json }
    }
    Enums: {}
    CompositeTypes: {}
  }
}
