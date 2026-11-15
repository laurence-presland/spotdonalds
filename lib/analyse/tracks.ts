import { sql } from "@/lib/db";

/** Count distinct tracks from plays and top items for this user. */
export async function countDistinctTracks(userId: string): Promise<number> {
  const rows = await sql()<{ tracks: number }[]>`
    select count(*)::int as tracks
    from (
      select track_id as id from spotdonalds.plays where user_id = ${userId}
      union
      select spotify_id as id from spotdonalds.top_items
      where user_id = ${userId} and kind = 'track'
    ) ids
  `;
  return Number(rows[0]?.tracks ?? 0);
}
