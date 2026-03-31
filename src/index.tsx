import { Hono } from "hono";
import { renderer } from "./renderer";
import { createDB } from "./db";
import { getTodaySong, selectDailySong } from "./lib/song-picker";

type Bindings = {
  YOUTUBE_API_KEY: string;
  DB: D1Database;
};

type Variables = {
  meta?: {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
  };
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use(renderer);

// エラー表示コンポーネント
function ErrorPage() {
  return (
    <div class="min-h-screen bg-background flex items-center justify-center p-4">
      <div class="max-w-md w-full text-center">
        <h1 class="text-lg text-black font-sorts">Error Occurred</h1>
      </div>
    </div>
  );
}

// トップページ：本日の曲を表示
app.get("/", async (c) => {
  try {
    const db = createDB(c.env.DB);
    let song = await getTodaySong(db, c.env.YOUTUBE_API_KEY);

    // 本日の曲がなければ選択して表示
    if (!song) {
      song = await selectDailySong(db, c.env.YOUTUBE_API_KEY);
    }

    // Cache-Controlヘッダーを設定
    // max-age=300: ブラウザは5分、s-maxage=86400: CDNは1日キャッシュ、must-revalidate: 再検証
    c.header(
      "Cache-Control",
      "public, max-age=300, s-maxage=86400, must-revalidate",
    );
    // ETagを設定（日付が変わるとキャッシュが更新される）
    c.header("ETag", `"${song.selectedDate}"`);

    const postContent = `#vwp_todays\nV.W.P Today's Song\nhttps://www.youtube.com/watch?v=${song.videoId}`;

    return c.render(
      <>
        <div class="w-screen h-screen flex flex-col items-center justify-center px-8">
          <h1 class="text-3xl text-center mb-16 font-sorts">
            V.W.P Today's Song
          </h1>
          <div class="w-full max-w-lg">
            <a
              href={`https://www.youtube.com/watch?v=${song.videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              class="group block"
            >
              <div class="overflow-hidden rounded-xl border border-gray-300 bg-card text-card-foreground shadow-md transition-all duration-300 hover:shadow-lg hover:-translate-y-1 bg-white">
                {/* Thumbnail */}
                <div class="relative aspect-video overflow-hidden bg-muted">
                  <img
                    src={song.thumbnail}
                    alt={song.title}
                    class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div class="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/10" />
                </div>

                {/* Content */}
                <div class="p-6">
                  <div class="flex items-center gap-2 text-sm text-muted-foreground">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class="h-4 w-4"
                    >
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" x2="16" y1="2" y2="6" />
                      <line x1="8" x2="8" y1="2" y2="6" />
                      <line x1="3" x2="21" y1="10" y2="10" />
                    </svg>
                    <time>{song.selectedDate}</time>
                  </div>

                  <h2 class="mt-3 text-base sm:text-lg leading-tight line-clamp-2">
                    {song.title}
                  </h2>

                  <div class="mt-4 flex items-center gap-2 text-sm font-medium text-primary">
                    <span>YouTubeで見る</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                    >
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </a>
          </div>
          {/* Footer */}
          <div class="mt-8 flex flex-col items-center gap-4">
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(postContent)}`}
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-2 px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-full transition-colors"
            >
              <img src="/x-logo.svg" alt="X" class="h-5 w-5" />
              <span>Share on X</span>
            </a>
            <p class="text-center text-lg text-black font-sorts">
              todays.vwp.observer
            </p>
          </div>
        </div>
      </>,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラー";
    console.error("Error:", e);
    return c.html(<ErrorPage />, 500);
  }
});

async function scheduled(
  _controller: ScheduledController,
  env: Bindings,
  _ctx: ExecutionContext,
) {
  try {
    const db = createDB(env.DB);
    await selectDailySong(db, env.YOUTUBE_API_KEY);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Scheduled event error:", message);
  }
}

export default {
  fetch: app.fetch,
  scheduled,
};
