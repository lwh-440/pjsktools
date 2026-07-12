import { ChevronLeft, List, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { apiGetWithSignal } from "../api";
import { StoryPlaybackPlayer, type StoryPlaybackContext } from "../components/StoryPlaybackPlayer";

type Chapter = { id: string; name?: string; title?: string };
type Detail = { chapters: Chapter[] };

export function StoryPlayerPage({ region }: { region: string }) {
  const { storyType = "", storyId = "", episodeId = "" } = useParams();
  const location = useLocation();
  const [playback, setPlayback] = useState<StoryPlaybackContext | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setPlayback(null); setError("");
    Promise.all([
      apiGetWithSignal<StoryPlaybackContext>(`/api/master/${region}/stories/${encodeURIComponent(storyType)}/${encodeURIComponent(storyId)}/episodes/${encodeURIComponent(episodeId)}/playback`, controller.signal),
      apiGetWithSignal<Detail>(`/api/master/${region}/stories/${encodeURIComponent(storyType)}/${encodeURIComponent(storyId)}/full`, controller.signal)
    ]).then(([nextPlayback, nextDetail]) => { setPlayback(nextPlayback); setDetail(nextDetail); }).catch((value) => { if (value?.name !== "AbortError") setError(value instanceof Error ? value.message : String(value)); });
    return () => controller.abort();
  }, [region, storyType, storyId, episodeId, reload]);
  const detailUrl = `/section/stories/${storyType}/${encodeURIComponent(storyId)}${location.search}`;
  if (error) return <section className="story-play-page"><Link to={detailUrl}><ChevronLeft size={16} />返回章节</Link><p className="warning-text">{error}</p><button type="button" onClick={() => setReload((value) => value + 1)}><RefreshCw size={16} />重试</button></section>;
  if (!playback) return <p className="empty-state">正在解析场景与首屏内容...</p>;
  return <section className="story-play-page"><div className="story-play-toolbar"><Link to={detailUrl}><ChevronLeft size={16} />返回章节</Link><details><summary><List size={16} />切换章节</summary><div>{(detail?.chapters ?? []).map((chapter) => <Link className={String(chapter.id) === episodeId ? "active" : ""} key={chapter.id} to={`/section/stories/${storyType}/${encodeURIComponent(storyId)}/${encodeURIComponent(chapter.id)}/play${location.search}`}>{chapter.name ?? chapter.title ?? chapter.id}</Link>)}</div></details></div><StoryPlaybackPlayer playback={playback} /></section>;
}
