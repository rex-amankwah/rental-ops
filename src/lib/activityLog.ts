import { supabase } from '@/lib/supabase'

export interface ActivityEntry {
  company_id: string
  order_id?: string | null
  actor_id?: string | null
  actor_name?: string | null
  entity_type: string
  entity_id?: string | null
  action: string
  description: string
  metadata?: Record<string, unknown> | null
}

/**
 * Fire-and-forget activity log. Never throws — logging must never block
 * the main workflow. Requires the activity_logs table to exist
 * (see supabase/migrations/20260514_activity_logs_table.sql).
 */
export async function logActivity(entry: ActivityEntry): Promise<void> {
  try {
    await supabase.from('activity_logs').insert({
      company_id:  entry.company_id,
      order_id:    entry.order_id   ?? null,
      actor_id:    entry.actor_id   ?? null,
      actor_name:  entry.actor_name ?? null,
      entity_type: entry.entity_type,
      entity_id:   entry.entity_id  ?? null,
      action:      entry.action,
      description: entry.description,
      metadata:    entry.metadata   ?? null,
      old_value:   null,
      new_value:   null,
    })
  } catch {
    // Silent — logging never breaks the primary workflow
  }
}
