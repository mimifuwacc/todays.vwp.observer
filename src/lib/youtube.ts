// All Songs of V.W.P from YouTube playlist
const PLAYLIST_ID = "PLa1ZLUkw_t9xlrfsH401bsDk69rvQgHBg";

export async function getPlaylist(apiKey: string) {
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${PLAYLIST_ID}&maxResults=50&key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status}`);
  }
  return response.json();
}
