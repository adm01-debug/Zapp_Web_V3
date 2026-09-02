export type Database = {
  public: {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    Tables: {}
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    Views: {}
    Functions: {
      has_role: { Args: never; Returns: boolean }
      own_public_helper: { Args: never; Returns: boolean }
    }
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    Enums: {}
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    CompositeTypes: {}
  }
  zapp: {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    Tables: {}
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    Views: {}
    Functions: {
      current_user_role: { Args: never; Returns: string }
    }
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    Enums: {}
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    CompositeTypes: {}
  }
}
