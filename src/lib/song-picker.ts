import { eq, desc } from "drizzle-orm";
import type { DB } from "../db";
import { songs } from "../db/schema";
import { getPlaylist } from "./youtube";

export type PlaylistItem = {
  id: string;
  snippet: {
    resourceId: {
      videoId: string;
    };
    title: string;
    thumbnails: {
      maxres?: { url: string };
      high?: { url: string };
      medium?: { url: string };
      standard?: { url: string };
    };
  };
  contentDetails: {
    videoPublishedAt: string;
  };
};

export type Song = {
  videoId: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
  selectedDate: string;
};

export type SongError = {
  error: string;
  message: string;
};

// YouTube APIレスポンスのバリデーション
function validatePlaylistResponse(data: unknown): { items: PlaylistItem[] } {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid YouTube API response: not an object");
  }

  const playlistData = data as { items?: unknown[] };
  if (!Array.isArray(playlistData.items)) {
    throw new Error("Invalid YouTube API response: items is not an array");
  }

  // 各アイテムのバリデーション
  const items: PlaylistItem[] = playlistData.items
    .filter((item): item is object => item != null && typeof item === "object")
    .map((item) => {
      const snippet = (item as { snippet?: unknown }).snippet;
      if (!snippet || typeof snippet !== "object") {
        return null;
      }

      const resourceId = (snippet as { resourceId?: unknown }).resourceId;
      const title = (snippet as { title?: unknown }).title;
      const thumbnails = (snippet as { thumbnails?: unknown }).thumbnails;
      const contentDetails = (item as { contentDetails?: unknown }).contentDetails;

      if (
        !resourceId ||
        typeof resourceId !== "object" ||
        !("videoId" in resourceId) ||
        typeof resourceId.videoId !== "string" ||
        !title ||
        typeof title !== "string" ||
        !contentDetails ||
        typeof contentDetails !== "object" ||
        !("videoPublishedAt" in contentDetails) ||
        typeof contentDetails.videoPublishedAt !== "string"
      ) {
        return null;
      }

      return {
        id: (item as { id: string }).id,
        snippet: {
          resourceId: { videoId: resourceId.videoId },
          title,
          thumbnails: thumbnails && typeof thumbnails === "object" ? thumbnails as PlaylistItem["snippet"]["thumbnails"] : {},
        },
        contentDetails: { videoPublishedAt: contentDetails.videoPublishedAt },
      } as PlaylistItem;
    })
    .filter((item): item is PlaylistItem => item !== null);

  return { items };
}

// 今日の日付を YYYY-MM-DD で取得（JST）
function getTodayDate(): string {
  const now = new Date();
  // UTCに9時間足してJSTに変換
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split("T")[0];
}

// videoIdからプレイリスト内の曲情報を取得
function findSongInPlaylist(
  items: PlaylistItem[],
  videoId: string,
): Song | null {
  const item = items.find((i) => i.snippet.resourceId.videoId === videoId);
  if (!item) return null;

  const thumbnail =
    item.snippet.thumbnails.maxres?.url ??
    item.snippet.thumbnails.high?.url ??
    item.snippet.thumbnails.medium?.url ??
    item.snippet.thumbnails.standard?.url ??
    "";

  return {
    videoId,
    title: item.snippet.title,
    thumbnail,
    publishedAt: item.contentDetails.videoPublishedAt,
    selectedDate: getTodayDate(),
  };
}

// プレイリストデータを安全に取得
async function getPlaylistSafe(apiKey: string): Promise<{ items: PlaylistItem[] }> {
  try {
    const data = await getPlaylist(apiKey);
    return validatePlaylistResponse(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to fetch playlist: ${message}`);
  }
}

// 本日の曲を取得
export async function getTodaySong(
  db: DB,
  apiKey: string,
): Promise<Song | null> {
  try {
    const today = getTodayDate();
    const result = await db
      .select()
      .from(songs)
      .where(eq(songs.selectedDate, today))
      .limit(1);

    if (!result[0]) return null;

    // プレイリストから曲の詳細情報を取得
    const playlist = await getPlaylistSafe(apiKey);
    return findSongInPlaylist(playlist.items, result[0].videoId);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to get today's song: ${message}`);
  }
}

// ランダムに曲を選択して保存
export async function selectDailySong(
  db: DB,
  apiKey: string,
): Promise<Song> {
  try {
    // 既に本日の曲が選択されている場合は返す
    const existing = await getTodaySong(db, apiKey);
    if (existing) {
      return existing;
    }

    // プレイリストから全曲を取得
    const playlist = await getPlaylistSafe(apiKey);
    const items = playlist.items;

    if (items.length === 0) {
      throw new Error("Playlist is empty");
    }

    // 既に選択済みの曲を取得（selectedDate降順でソートして最後の曲を取得）
    const selectedSongs = await db
      .select()
      .from(songs)
      .orderBy(desc(songs.selectedDate));
    const selectedVideoIds = new Set(selectedSongs.map((s) => s.videoId));

    // 未選択の曲をフィルタリング
    let availableItems = items.filter((item) => {
      const videoId = item.snippet.resourceId.videoId;
      return !selectedVideoIds.has(videoId);
    });

    // すべての曲が選択済みの場合はデータベースをリセット
    if (availableItems.length === 0) {
      // 最後に選ばれた曲を取得（2日連続防止用）
      const lastSelected = selectedSongs.at(0);

      // データベースをリセット
      await db.delete(songs);

      // 最後の曲を除外済みとしてマーク
      if (lastSelected) {
        await db.insert(songs).values({
          videoId: lastSelected.videoId,
          selectedDate: lastSelected.selectedDate,
        });
        selectedVideoIds.add(lastSelected.videoId);
      }

      // 再度フィルタリング
      availableItems = items.filter((item) => {
        const videoId = item.snippet.resourceId.videoId;
        return !selectedVideoIds.has(videoId);
      });
    }

    if (availableItems.length === 0) {
      throw new Error("No available songs to select");
    }

    const randomIndex = Math.floor(Math.random() * availableItems.length);
    const selectedItem = availableItems[randomIndex]!;
    const videoId = selectedItem.snippet.resourceId.videoId;

    await db.insert(songs).values({
      videoId,
      selectedDate: getTodayDate(),
    });

    const song = findSongInPlaylist(items, videoId);
    if (!song) {
      throw new Error("Song not found after selection");
    }

    return song;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to select daily song: ${message}`);
  }
}
