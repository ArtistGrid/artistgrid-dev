"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePlayer } from "@/app/providers";
import { useToast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, X, Play, Pause, Filter, Share2, ChevronDown, CircleSlash, ListPlus, MoreHorizontal, Download, ExternalLink, Radio, Link as LinkIcon, AlertTriangle, Share, SkipForward } from "lucide-react";
import { TrackerResponse, Era, TALeak, resolvePlayableUrl, resolveMultipleUrls } from "@/app/actions";

interface Track {
  id: string;
  name: string;
  extra: string;
  url: string;
  playableUrl: string | null;
  source: "pillows" | "froste" | "juicewrldapi" | "krakenfiles" | "imgur" | "pixeldrain" | "soundcloud" | "unknown";
  quality?: string;
  trackLength?: string;
  type?: string;
  description?: string;
  eraImage?: string;
  eraName?: string;
  artistName?: string;
}

interface FilterOptions {
  showPlayableOnly: boolean;
  qualityFilter: string;
}

interface PlayableTrackData {
  track: TALeak;
  era: Era;
  url: string;
  playableUrl: string;
}

interface LastFMModalProps {
  isOpen: boolean;
  onClose: () => void;
  lastfm: {
    isAuthenticated: boolean;
    username: string | null;
    getAuthUrl: () => Promise<{ token: string; url: string }>;
    completeAuth: (token: string) => Promise<{ success: boolean; username: string }>;
    disconnect: () => void;
  };
  token: string | null;
  setToken: (t: string | null) => void;
}

const ART_TABS = ["Art"];
const NON_PLAYABLE_TABS = ["Art", "Tracklists", "Misc"];

function generateTrackId(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i);
    hash = hash & hash;
  }
  return "tk" + Math.abs(hash).toString(36);
}

function isUrl(str: string | null | undefined): boolean {
  if (!str || typeof str !== "string") return false;
  return str.startsWith("http://") || str.startsWith("https://");
}

function normalizePillowsUrl(url: string): string {
  return url.replace(/pillowcase\.su/g, "pillows.su");
}

function extractSoundcloudPath(url: string): string | null {
  const match = url.match(/soundcloud\.com\/([^\/]+\/[^\/\?]+)/);
  return match ? match[1] : null;
}

function getTrackUrl(track: TALeak): string | null {
  if (track.url && isUrl(track.url)) return normalizePillowsUrl(track.url);
  if (track.quality && isUrl(track.quality)) return normalizePillowsUrl(track.quality);
  if (track.available_length && isUrl(track.available_length)) return normalizePillowsUrl(track.available_length);
  return null;
}

function getTrackDescription(track: TALeak): string | null {
  return (track as any).description || (track as any).notes || (track as any).info || null;
}

function encodeTrackForUrl(url: string): string {
  return btoa(url).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeTrackFromUrl(encoded: string): string | null {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padding = (4 - (base64.length % 4)) % 4;
    return atob(base64 + "=".repeat(padding));
  } catch {
    return null;
  }
}

function transformUrlForOpening(url: string): string {
  if (url.includes("soundcloud.com/")) {
    const path = extractSoundcloudPath(url);
    if (path) return `https://sc.bloat.cat/${path}`;
  }
  return url;
}

const Modal = ({ isOpen, onClose, children, ariaLabel }: { isOpen: boolean; onClose: () => void; children: React.ReactNode; ariaLabel: string }) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <div className="bg-neutral-950 border border-neutral-800 shadow-2xl rounded-xl w-full max-w-md relative animate-in fade-in-0 zoom-in-95" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon" onClick={onClose} className="absolute top-3 right-3 text-neutral-500 hover:text-white h-8 w-8 rounded-lg z-10">
          <X className="w-5 h-5" />
        </Button>
        {children}
      </div>
    </div>
  );
};

const LastFMModal = ({ isOpen, onClose, lastfm, token, setToken }: LastFMModalProps) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      const { token: newToken, url } = await lastfm.getAuthUrl();
      setToken(newToken);
      window.open(url, "_blank", "noopener,noreferrer,width=800,height=600");
    } catch {} finally {
      setIsLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      await lastfm.completeAuth(token);
      setToken(null);
      onClose();
    } catch {} finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} ariaLabel="Last.fm Connection">
      <div className="p-6 pt-12 text-center">
        <Radio className="w-12 h-12 mx-auto mb-4 text-neutral-400" />
        <h2 className="text-xl font-bold text-white mb-2">Last.fm Scrobbling</h2>
        {lastfm.isAuthenticated ? (
          <div className="space-y-4">
            <p className="text-neutral-300">Connected as <span className="font-semibold text-white">{lastfm.username}</span></p>
            <Button variant="outline" onClick={() => { lastfm.disconnect(); onClose(); }} className="text-red-400 border-red-400/30 hover:bg-red-400/10">Disconnect</Button>
          </div>
        ) : token ? (
          <div className="space-y-4">
            <p className="text-neutral-400">Authorize in the popup window, then click below to complete</p>
            <Button onClick={handleComplete} disabled={isLoading} className="bg-white text-black hover:bg-neutral-200">{isLoading ? "Connecting..." : "Complete Connection"}</Button>
            <Button variant="ghost" onClick={() => setToken(null)} className="text-neutral-500 hover:text-white">Cancel</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-neutral-400">Connect your Last.fm account to scrobble tracks while listening</p>
            <Button onClick={handleConnect} disabled={isLoading} className="bg-white text-black hover:bg-neutral-200">{isLoading ? "Loading..." : "Connect Last.fm"}</Button>
          </div>
        )}
      </div>
    </Modal>
  );
};

const ImageLightbox = ({ src, alt, originalUrl, onClose }: { src: string; alt: string; originalUrl: string; onClose: () => void }) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="relative max-w-4xl max-h-[90vh] w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={alt} className="max-w-full max-h-full object-contain rounded-lg cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(originalUrl, "_blank", "noopener,noreferrer")} title="Click to open original" />
        <Button variant="ghost" size="icon" onClick={onClose} className="absolute top-4 right-4 text-white hover:bg-white/10"><X className="w-6 h-6" /></Button>
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-neutral-400">Click image to open original link</p>
      </div>
    </div>
  );
};

const ArtGallery = ({ eras, onImageClick }: { eras: Record<string, Era>; onImageClick: (url: string, name: string) => void }) => {
  const [expandedEras, setExpandedEras] = useState<Set<string>>(new Set([Object.keys(eras)[0] || ""]));

  const toggleEra = (eraKey: string) => {
    setExpandedEras((prev) => {
      const next = new Set(prev);
      if (next.has(eraKey)) next.delete(eraKey);
      else next.add(eraKey);
      return next;
    });
  };

  const getImageUrl = (url: string): string | null => {
    if (url.includes("ibb.co")) {
      const match = url.match(/ibb\.co\/([a-zA-Z0-9]+)/);
      if (match) return `https://i.ibb.co/${match[1]}/image.jpg`;
    }
    if (url.includes("imgur.com") || url.includes("i.imgur.com")) {
      const match = url.match(/imgur\.com\/([a-zA-Z0-9]+)/);
      if (match) return `https://i.imgur.com/${match[1]}.jpg`;
    }
    if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return url;
    return null;
  };

  return (
    <div className="space-y-6">
      {Object.entries(eras).map(([key, era]) => (
        <div key={key} className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
          <button className="w-full flex items-center gap-4 p-5 text-left hover:bg-white/[0.02] transition-colors" onClick={() => toggleEra(key)}>
            {era.image ? <img src={era.image} alt={era.name} className="w-16 h-16 rounded-xl object-cover bg-neutral-800" /> : <div className="w-16 h-16 rounded-xl bg-neutral-800" />}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-white">{era.name || key}</h3>
              {era.extra && <p className="text-sm text-neutral-500">{era.extra}</p>}
            </div>
            <ChevronDown className={`w-5 h-5 text-neutral-500 transition-transform ${expandedEras.has(key) ? "rotate-180" : ""}`} />
          </button>
          {expandedEras.has(key) && era.data && (
            <div className="px-5 pb-5">
              {Object.entries(era.data).map(([cat, items]) => (
                <div key={cat} className="mb-6 last:mb-0">
                  {cat !== "Default" && <h4 className="text-sm font-semibold text-neutral-300 pb-3 mb-3 border-b border-neutral-800">{cat}</h4>}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {(items as TALeak[]).map((item, i) => {
                      const url = item.url || (item.urls && item.urls[0]);
                      const imageUrl = url ? getImageUrl(url) : null;
                      return (
                        <div key={i} className="group cursor-pointer rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800 hover:border-neutral-600 transition-all" onClick={() => url && onImageClick(url, item.name)}>
                          <div className="aspect-square relative bg-neutral-800">
                            {imageUrl ? <img src={imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" /> : <div className="w-full h-full flex items-center justify-center text-neutral-600"><LinkIcon className="w-8 h-8" /></div>}
                          </div>
                          <div className="p-3">
                            <p className="text-sm font-medium text-white truncate">{item.name}</p>
                            {item.description && <p className="text-xs text-neutral-500 truncate mt-1">{item.description}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default function TrackerViewClient({
  trackerId,
  initialData,
  artistName,
  trackParam,
  tabParam
}: {
  trackerId: string;
  initialData: TrackerResponse;
  artistName: string | null;
  trackParam: string | null;
  tabParam: string | undefined;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { state: playerState, playTrack, addToQueue, clearQueue, togglePlayPause, lastfm } = usePlayer();
  const [inputValue, setInputValue] = useState(trackerId);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedEras, setExpandedEras] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FilterOptions>({ showPlayableOnly: false, qualityFilter: "all" });
  const [resolvedUrls, setResolvedUrls] = useState<Map<string, string | null>>(new Map());
  const [isResolving, setIsResolving] = useState(false);
  const [lastfmModalOpen, setLastfmModalOpen] = useState(false);
  const [lastfmToken, setLastfmToken] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string; originalUrl: string } | null>(null);
  const [highlightedTrackUrl, setHighlightedTrackUrl] = useState<string | null>(null);
  const highlightedTrackRef = useRef<HTMLDivElement | null>(null);

  const artistDisplayName = useMemo(() => artistName || initialData.name || "Unknown Artist", [artistName, initialData.name]);
  const currentTab = initialData.current_tab;
  const isArtTab = ART_TABS.includes(currentTab);

  useEffect(() => {
    if (trackParam) {
      const decodedUrl = decodeTrackFromUrl(trackParam);
      if (decodedUrl) {
        setHighlightedTrackUrl(decodedUrl);
      }
    }
  }, [trackParam]);

  useEffect(() => {
    if (highlightedTrackRef.current && highlightedTrackUrl) {
      setTimeout(() => highlightedTrackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 500);
    }
  }, [highlightedTrackUrl]);

  useEffect(() => {
    if (isArtTab || NON_PLAYABLE_TABS.includes(currentTab)) return;

    const urls: string[] = [];
    for (const era of Object.values(initialData.eras)) {
      if (!era.data) continue;
      for (const tracks of Object.values(era.data)) {
        if (!Array.isArray(tracks)) continue;
        for (const t of tracks) {
          const url = getTrackUrl(t);
          if (url) urls.push(url);
        }
      }
    }

    if (urls.length === 0) return;

    setIsResolving(true);
    resolveMultipleUrls(urls).then((results) => {
      setResolvedUrls(new Map(Object.entries(results)));
      setIsResolving(false);

      if (highlightedTrackUrl && results[highlightedTrackUrl]) {
        for (const era of Object.values(initialData.eras)) {
          if (!era.data) continue;
          for (const tracks of Object.values(era.data)) {
            if (!Array.isArray(tracks)) continue;
            for (const track of tracks) {
              const url = getTrackUrl(track);
              if (url === highlightedTrackUrl && results[url]) {
                playTrack(createTrackObject(track, era, url, results[url]!));
                return;
              }
            }
          }
        }
      }
    });
  }, [initialData.eras, isArtTab, currentTab]);

  const filteredData = useMemo(() => {
    const result: Record<string, Era> = {};
    const query = searchQuery.toLowerCase();

    for (const [key, era] of Object.entries(initialData.eras)) {
      if (isArtTab) {
        result[key] = era;
        continue;
      }

      if (!era.data) continue;
      const filteredCategories: Record<string, TALeak[]> = {};

      for (const [cat, tracks] of Object.entries(era.data)) {
        if (!Array.isArray(tracks)) continue;
        const filtered = tracks.filter((t) => {
          const url = getTrackUrl(t);
          if (!url) return false;
          if (filters.showPlayableOnly && !resolvedUrls.get(url)) return false;
          if (filters.qualityFilter !== "all" && !(t.quality?.toLowerCase() || "").includes(filters.qualityFilter.toLowerCase())) return false;
          if (query) {
            const searchable = `${t.name || ""} ${t.extra || ""} ${getTrackDescription(t) || ""}`.toLowerCase();
            if (!searchable.includes(query)) return false;
          }
          return true;
        });
        if (filtered.length > 0) filteredCategories[cat] = filtered;
      }
      if (Object.keys(filteredCategories).length > 0) result[key] = { ...era, data: filteredCategories };
    }
    return result;
  }, [initialData.eras, searchQuery, filters, resolvedUrls, isArtTab]);

  const allPlayableTracks = useMemo((): PlayableTrackData[] => {
    if (isArtTab) return [];
    const tracks: PlayableTrackData[] = [];
    for (const era of Object.values(filteredData)) {
      if (!era.data) continue;
      for (const trackList of Object.values(era.data)) {
        if (!Array.isArray(trackList)) continue;
        for (const track of trackList) {
          const url = getTrackUrl(track);
          const playableUrl = url ? resolvedUrls.get(url) : null;
          if (url && playableUrl) tracks.push({ track, era, url, playableUrl });
        }
      }
    }
    return tracks;
  }, [filteredData, resolvedUrls, isArtTab]);

  const createTrackObject = useCallback((rawTrack: TALeak, era: Era, url: string, playableUrl: string): Track => ({
    id: generateTrackId(url),
    name: rawTrack.name || "Unknown",
    extra: rawTrack.extra || "",
    url,
    playableUrl,
    source: "unknown",
    quality: rawTrack.quality && !isUrl(rawTrack.quality) ? rawTrack.quality : undefined,
    trackLength: rawTrack.track_length,
    type: rawTrack.type,
    description: getTrackDescription(rawTrack) || undefined,
    eraImage: era.image,
    eraName: era.name,
    artistName: artistDisplayName,
  }), [artistDisplayName]);

  const qualities = useMemo(() => {
    const set = new Set<string>();
    for (const era of Object.values(initialData.eras)) {
      if (!era.data) continue;
      for (const tracks of Object.values(era.data)) {
        if (!Array.isArray(tracks)) continue;
        for (const t of tracks) {
          if (t.quality && !isUrl(t.quality)) set.add(t.quality);
        }
      }
    }
    return Array.from(set);
  }, [initialData.eras]);

  const stats = useMemo(() => {
    let total = 0, playable = 0;
    for (const era of Object.values(initialData.eras)) {
      if (!era.data) continue;
      for (const tracks of Object.values(era.data)) {
        if (Array.isArray(tracks)) {
          total += tracks.length;
          for (const t of tracks) {
            const url = getTrackUrl(t);
            if (url && resolvedUrls.get(url)) playable++;
          }
        }
      }
    }
    return { total, playable };
  }, [initialData.eras, resolvedUrls]);

  const handleLoad = useCallback(() => {
    if (!inputValue || inputValue.length !== 44) {
      toast({ title: "Invalid ID", description: "Tracker ID must be 44 characters" });
      return;
    }
    router.push(`/view?id=${inputValue}`);
  }, [inputValue, router, toast]);

  const handleShare = useCallback(() => {
    let url = `${window.location.origin}/view?id=${trackerId}`;
    if (artistName) url += `&artist=${encodeURIComponent(artistName)}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Copied!", description: "Share link copied to clipboard" });
  }, [trackerId, artistName, toast]);

  const handleShareTrack = useCallback((trackUrl: string, trackName: string) => {
    const encodedTrack = encodeTrackForUrl(trackUrl);
    let shareUrl = `${window.location.origin}/view?id=${trackerId}&track=${encodedTrack}`;
    if (artistName) shareUrl += `&artist=${encodeURIComponent(artistName)}`;
    if (currentTab && currentTab !== initialData.tabs?.[0]) shareUrl += `&tab=${encodeURIComponent(currentTab)}`;
    navigator.clipboard.writeText(shareUrl);
    toast({ title: "Track link copied!", description: `Share link for "${trackName}" copied to clipboard` });
  }, [trackerId, artistName, currentTab, initialData.tabs, toast]);

  const handleTabChange = useCallback((tab: string) => {
    if (tab === currentTab) return;
    let url = `/view?id=${trackerId}&tab=${encodeURIComponent(tab)}`;
    if (artistName) url += `&artist=${encodeURIComponent(artistName)}`;
    router.push(url);
  }, [trackerId, currentTab, artistName, router]);

  const toggleEra = useCallback((eraKey: string) => {
    setExpandedEras((prev) => {
      const next = new Set(prev);
      if (next.has(eraKey)) next.delete(eraKey);
      else next.add(eraKey);
      return next;
    });
  }, []);

  const handleOpenUrl = useCallback((url: string) => {
    window.open(transformUrlForOpening(url), "_blank", "noopener,noreferrer");
  }, []);

  const handlePlayTrack = useCallback(async (rawTrack: TALeak, era: Era) => {
    const url = getTrackUrl(rawTrack);
    if (!url) return;

    if (playerState.currentTrack?.url === url) {
      togglePlayPause();
      return;
    }

    let playableUrl = resolvedUrls.get(url);
    if (playableUrl === undefined) {
      playableUrl = await resolvePlayableUrl(url);
    }

    if (!playableUrl) {
      handleOpenUrl(url);
      return;
    }

    const track = createTrackObject(rawTrack, era, url, playableUrl);
    clearQueue();
    playTrack(track);

    const currentIdx = allPlayableTracks.findIndex(t => t.url === url);
    if (currentIdx !== -1) {
      const remainingTracks = allPlayableTracks.slice(currentIdx + 1);
      for (const t of remainingTracks) {
        addToQueue(createTrackObject(t.track, t.era, t.url, t.playableUrl));
      }
    }
  }, [resolvedUrls, playTrack, playerState.currentTrack, togglePlayPause, handleOpenUrl, allPlayableTracks, addToQueue, clearQueue, createTrackObject]);

  const handlePlayNext = useCallback(async (rawTrack: TALeak, era: Era) => {
    const url = getTrackUrl(rawTrack);
    if (!url) return;
    let playableUrl = resolvedUrls.get(url);
    if (playableUrl === undefined) playableUrl = await resolvePlayableUrl(url);
    if (!playableUrl) {
      toast({ title: "Cannot queue", description: "Track is not playable" });
      return;
    }
    const track = createTrackObject(rawTrack, era, url, playableUrl);
    addToQueue(track);
    toast({ title: "Playing next", description: track.name });
  }, [resolvedUrls, addToQueue, toast, createTrackObject]);

  const handleAddToQueue = useCallback(async (rawTrack: TALeak, era: Era) => {
    const url = getTrackUrl(rawTrack);
    if (!url) return;
    let playableUrl = resolvedUrls.get(url);
    if (playableUrl === undefined) playableUrl = await resolvePlayableUrl(url);
    if (!playableUrl) {
      toast({ title: "Cannot queue", description: "Track is not playable" });
      return;
    }
    const track = createTrackObject(rawTrack, era, url, playableUrl);
    addToQueue(track);
    toast({ title: "Added to queue", description: track.name });
  }, [resolvedUrls, addToQueue, toast, createTrackObject]);

  const handleDownload = useCallback(async (rawTrack: TALeak) => {
    const url = getTrackUrl(rawTrack);
    if (!url) return;
    let playableUrl = resolvedUrls.get(url);
    if (playableUrl === undefined) playableUrl = await resolvePlayableUrl(url);
    if (!playableUrl) {
      toast({ title: "Cannot download", description: "No playable URL available" });
      return;
    }
    const link = document.createElement("a");
    link.href = playableUrl;
    link.download = `${rawTrack.name || "track"}.mp3`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [resolvedUrls, toast]);

  const handleOpenOriginal = useCallback((rawTrack: TALeak) => {
    const url = getTrackUrl(rawTrack);
    if (url) handleOpenUrl(url);
  }, [handleOpenUrl]);

  const handleArtImageClick = useCallback((url: string, name: string) => {
    const getDirectImageUrl = (u: string): string | null => {
      if (u.includes("ibb.co")) {
        const match = u.match(/ibb\.co\/([a-zA-Z0-9]+)/);
        if (match) return `https://i.ibb.co/${match[1]}/image.jpg`;
      }
      if (u.includes("imgur.com")) {
        const match = u.match(/imgur\.com\/([a-zA-Z0-9]+)/);
        if (match) return `https://i.imgur.com/${match[1]}.jpg`;
      }
      if (u.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return u;
      return null;
    };
    const directUrl = getDirectImageUrl(url);
    if (directUrl) setLightboxImage({ src: directUrl, alt: name, originalUrl: url });
    else window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  return (
    <div className="min-h-screen bg-black pb-24">
      <header className="sticky top-0 z-30 py-4 bg-black/70 backdrop-blur-lg border-b border-neutral-900">
        <div className="max-w-7xl mx-auto flex items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="text-2xl font-bold bg-gradient-to-b from-neutral-50 to-neutral-400 bg-clip-text text-transparent hidden sm:block">ArtistGrid</Link>
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500 pointer-events-none" />
            <Input type="text" placeholder="Paste tracker ID (44 characters)..." value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLoad()} className="bg-neutral-900 border-2 border-neutral-800 text-white placeholder:text-neutral-500 focus:border-white/50 rounded-xl w-full pl-12 pr-10 h-12" />
            {inputValue && <Button variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 text-neutral-500 hover:text-white" onClick={() => setInputValue("")}><X className="w-4 h-4" /></Button>}
          </div>
          <Button variant="outline" size="icon" onClick={handleShare} className="bg-neutral-900 border-neutral-800 hover:bg-neutral-800 text-white"><Share2 className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => setLastfmModalOpen(true)} aria-label="Last.fm" className={`bg-neutral-900 border-neutral-800 hover:bg-neutral-800 ${lastfm.isAuthenticated ? "text-green-500 hover:text-green-400" : "text-white hover:text-white"}`}><Radio className="w-5 h-5" /></Button>
          <Button onClick={handleLoad} className="bg-white text-black hover:bg-neutral-200">Load</Button>
        </div>
      </header>
      <LastFMModal isOpen={lastfmModalOpen} onClose={() => setLastfmModalOpen(false)} lastfm={lastfm} token={lastfmToken} setToken={setLastfmToken} />
      {lightboxImage && <ImageLightbox src={lightboxImage.src} alt={lightboxImage.alt} originalUrl={lightboxImage.originalUrl} onClose={() => setLightboxImage(null)} />}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <h1 className="text-2xl font-bold text-white mb-4">{artistDisplayName}</h1>
        {initialData.tabs && initialData.tabs.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6 pb-4 border-b border-neutral-800 overflow-x-auto">
            {initialData.tabs.map((tab) => (
              <Button key={tab} variant={currentTab === tab ? "default" : "outline"} size="sm" onClick={() => handleTabChange(tab)} className={`flex-shrink-0 ${currentTab === tab ? "bg-white text-black hover:bg-neutral-200" : "bg-neutral-900 border-neutral-800 hover:bg-neutral-800 text-white"}`}>{tab}</Button>
            ))}
          </div>
        )}
        {!isArtTab && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <Input type="text" placeholder="Search tracks..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-neutral-900 border-neutral-800 text-white pl-10 h-10 rounded-lg" />
            </div>
            <div className="flex items-center gap-3">
              {resolvedUrls.size > 0 && <span className="text-sm text-neutral-500">{stats.playable}/{stats.total} playable</span>}
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="bg-neutral-900 border-neutral-800 hover:bg-neutral-800 text-white"><Filter className="w-4 h-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-neutral-950 border-neutral-800 text-neutral-200">
                  <DropdownMenuLabel>Filters</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-neutral-800" />
                  <DropdownMenuCheckboxItem checked={filters.showPlayableOnly} onCheckedChange={(c) => setFilters((f) => ({ ...f, showPlayableOnly: !!c }))}>Show playable only</DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator className="bg-neutral-800" />
                  <DropdownMenuLabel>Quality</DropdownMenuLabel>
                  <DropdownMenuCheckboxItem checked={filters.qualityFilter === "all"} onCheckedChange={() => setFilters((f) => ({ ...f, qualityFilter: "all" }))}>All qualities</DropdownMenuCheckboxItem>
                  {qualities.map((q) => <DropdownMenuCheckboxItem key={q} checked={filters.qualityFilter === q} onCheckedChange={() => setFilters((f) => ({ ...f, qualityFilter: q }))}>{q}</DropdownMenuCheckboxItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
        {isArtTab ? (
          <ArtGallery eras={filteredData} onImageClick={handleArtImageClick} />
        ) : Object.keys(filteredData).length > 0 ? (
          <div className="space-y-6">
            {Object.entries(filteredData).map(([key, era]) => (
              <div key={key} style={{ background: era.backgroundColor ? `color-mix(in srgb, ${era.backgroundColor}, oklch(14.5% 0 0) 80%)` : "oklch(14.5% 0 0)" }} className="border border-neutral-800 rounded-xl overflow-hidden">
                <button className="w-full flex items-center gap-4 p-5 text-left hover:bg-white/[0.02] transition-colors" onClick={() => toggleEra(key)}>
                  {era.image ? <img src={era.image} alt={era.name} className="w-16 h-16 rounded-xl object-cover bg-neutral-800" /> : <div className="w-16 h-16 rounded-xl bg-neutral-800" />}
                  <div className="flex-1 min-w-0">
                    <h3 style={{ color: era.textColor ? `color-mix(in srgb, ${era.textColor}, rgb(255,255,255) 40%)` : "white" }} className="text-lg font-bold">{era.name || key}</h3>
                    {era.extra && <p className="text-sm text-neutral-500">{era.extra}</p>}
                  </div>
                  <ChevronDown className={`w-5 h-5 text-neutral-500 transition-transform ${expandedEras.has(key) ? "rotate-180" : ""}`} />
                </button>
                {expandedEras.has(key) && (
                  <div className="px-5 pb-5">
                    {era.description && <p className="text-sm text-neutral-400 p-4 bg-black/30 rounded-xl mb-5">{era.description}</p>}
                    {era.data && Object.entries(era.data).map(([cat, tracks]) => (
                      <div key={cat} className="mb-6 last:mb-0">
                        <h4 className="text-sm font-semibold text-neutral-300 pb-3 mb-3 border-b border-neutral-800">{cat}</h4>
                        <div className="space-y-2">
                          {(tracks as TALeak[]).map((track, i) => {
                            const url = getTrackUrl(track);
                            const playableUrl = url ? resolvedUrls.get(url) : null;
                            const isPlayable = !!playableUrl;
                            const isCurrentlyPlaying = playerState.currentTrack?.url === url && playerState.isPlaying;
                            const isCurrentTrack = playerState.currentTrack?.url === url;
                            const isHighlighted = url === highlightedTrackUrl;
                            const description = getTrackDescription(track);
                            return (
                              <div key={i} ref={isHighlighted ? highlightedTrackRef : null} className={`rounded-xl transition-colors ${isHighlighted ? "bg-yellow-500/20 border border-yellow-500/50 ring-2 ring-yellow-500/30" : isCurrentTrack ? "bg-white/10 border border-white/20" : "bg-white/[0.02] hover:bg-white/[0.05] border border-transparent"}`}>
                                <div className="flex items-center gap-3 p-3">
                                  {isPlayable ? (
                                    <button onClick={() => handlePlayTrack(track, era)} className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full bg-white text-black hover:scale-110 transition-transform">{isCurrentlyPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}</button>
                                  ) : (
                                    <button onClick={() => url && handleOpenUrl(url)} className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full bg-white text-black hover:scale-110 transition-transform"><LinkIcon className="w-4 h-4" /></button>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-white text-sm truncate">{track.name || "Unknown"}</div>
                                    {track.extra && <div className="text-xs text-neutral-500 truncate">{track.extra}</div>}
                                  </div>
                                  <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                                    {track.type && track.type !== "Unknown" && track.type !== "N/A" && <span className="text-xs px-2 py-1 bg-white/5 rounded text-neutral-400">{track.type}</span>}
                                    {track.quality && !isUrl(track.quality) && track.quality !== "N/A" && <span className="text-xs px-2 py-1 bg-white/5 rounded text-neutral-400">{track.quality}</span>}
                                    {track.track_length && track.track_length !== "N/A" && track.track_length !== "?:??" && <span className="text-xs px-2 py-1 bg-white/5 rounded text-neutral-400">{track.track_length}</span>}
                                  </div>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="text-neutral-500 hover:text-white hover:bg-white/10 w-8 h-8 rounded-lg"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48 bg-neutral-950 border-neutral-800 text-neutral-200">
                                      {url && <DropdownMenuItem onClick={() => handleShareTrack(url, track.name || "Track")} className="cursor-pointer"><Share className="w-4 h-4 mr-2" />Share Track</DropdownMenuItem>}
                                      {isPlayable && (
                                        <>
                                          <DropdownMenuItem onClick={() => handlePlayNext(track, era)} className="cursor-pointer"><SkipForward className="w-4 h-4 mr-2" />Play Next</DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handleAddToQueue(track, era)} className="cursor-pointer"><ListPlus className="w-4 h-4 mr-2" />Add to Queue</DropdownMenuItem>
                                          <DropdownMenuSeparator className="bg-neutral-800" />
                                          <DropdownMenuItem onClick={() => handleDownload(track)} className="cursor-pointer"><Download className="w-4 h-4 mr-2" />Download</DropdownMenuItem>
                                        </>
                                      )}
                                      <DropdownMenuItem onClick={() => handleOpenOriginal(track)} className="cursor-pointer"><ExternalLink className="w-4 h-4 mr-2" />Open Original URL</DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                                {description && <div className="px-3 pb-3"><p className="text-xs text-neutral-500 pl-[52px]">{description}</p></div>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 flex flex-col items-center">
            <CircleSlash className="w-16 h-16 text-neutral-700 mb-4" />
            <h3 className="text-lg font-medium text-neutral-300">No Tracks Found</h3>
            <p className="text-neutral-500 mt-1">{searchQuery ? `No results for "${searchQuery}"` : "Try adjusting your filters"}</p>
          </div>
        )}
        <div className="mt-12 pt-6 border-t border-neutral-800">
          <div className="flex flex-col items-center gap-4 max-w-xl mx-auto">
            <div className="flex items-center justify-center gap-2 text-xs text-neutral-500 bg-neutral-900/50 px-4 py-2 rounded-lg w-full">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>ArtistGrid does not host any illegal content. All links point to third-party services.</span>
            </div>
            <p className="text-xs text-neutral-600 text-center leading-relaxed">
              ArtistGrid is not affiliated with, endorsed by, or associated with Google, TrackerHub, or any artists whose content may appear in these trackers. We do not host, store, or distribute any copyrighted content.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
