import type { ItemSubscription, SubscriptionItemKind } from '../types'

function toItemSubscription(row: Record<string, unknown>): ItemSubscription {
  return {
    item_kind: row.item_kind as SubscriptionItemKind,
    item_id: Number(row.item_id),
    user_id: String(row.user_id),
    created_at: String(row.created_at)
  }
}

export async function addSubscription(
  db: D1Database,
  itemKind: SubscriptionItemKind,
  itemId: number,
  userId: string
): Promise<'added' | 'duplicate'> {
  const result = await db
    .prepare(`INSERT OR IGNORE INTO subscriptions (item_kind, item_id, user_id) VALUES (?, ?, ?)`)
    .bind(itemKind, itemId, userId)
    .run()

  return (result.meta.changes ?? 0) > 0 ? 'added' : 'duplicate'
}

export async function removeSubscription(
  db: D1Database,
  itemKind: SubscriptionItemKind,
  itemId: number,
  userId: string
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM subscriptions WHERE item_kind = ? AND item_id = ? AND user_id = ?`)
    .bind(itemKind, itemId, userId)
    .run()

  return (result.meta.changes ?? 0) > 0
}

export async function isSubscribed(
  db: D1Database,
  itemKind: SubscriptionItemKind,
  itemId: number,
  userId: string
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS subscribed FROM subscriptions WHERE item_kind = ? AND item_id = ? AND user_id = ?`)
    .bind(itemKind, itemId, userId)
    .first<{ subscribed?: number }>()

  return Boolean(row?.subscribed)
}

export async function listSubscribedItemIds(
  db: D1Database,
  itemKind: SubscriptionItemKind,
  userId: string,
  itemIds: number[]
): Promise<Set<number>> {
  if (itemIds.length === 0) {
    return new Set<number>()
  }

  const placeholders = itemIds.map(() => '?').join(', ')
  const result = await db
    .prepare(`
      SELECT item_id
      FROM subscriptions
      WHERE item_kind = ? AND user_id = ? AND item_id IN (${placeholders})
    `)
    .bind(itemKind, userId, ...itemIds)
    .all<Record<string, unknown>>()

  return new Set((result.results ?? []).map((row) => Number(row.item_id)))
}

export async function countSubscriptions(db: D1Database, itemKind: SubscriptionItemKind, itemId: number): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS count FROM subscriptions WHERE item_kind = ? AND item_id = ?`)
    .bind(itemKind, itemId)
    .first<{ count?: number }>()

  return Number(row?.count ?? 0)
}

export async function listSubscriptionsForItem(
  db: D1Database,
  itemKind: SubscriptionItemKind,
  itemId: number
): Promise<ItemSubscription[]> {
  const result = await db
    .prepare(`
      SELECT item_kind, item_id, user_id, created_at
      FROM subscriptions
      WHERE item_kind = ? AND item_id = ?
      ORDER BY created_at ASC
    `)
    .bind(itemKind, itemId)
    .all<Record<string, unknown>>()

  return (result.results ?? []).map(toItemSubscription)
}
