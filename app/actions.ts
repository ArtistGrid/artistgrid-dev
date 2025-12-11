"use server";

import { cache } from "react";

const API_BASE = "https://tracker.israeli.ovh";
const API_KEY = process.env.TRACKER_API_KEY;
const KRAKENFILES_API = "https://info.artistgrid.cx/kf/?id=";
const IMGUR_API = "https://info.artistgrid.cx/imgur/?id=";
const TRENDS_API = "https://trends.artistgrid.cx/";

interface Artist {
  name: string;
  url: string;
  imageFilename: string;
  isLinkWorking: boolean;
  isUpdated: boolean;
  isStarred: boolean;
}

export interface Era {
  name: string;
  extra?: string;
  timeline?: string;
  fileInfo?: string[];
  image?: string;
  textColor?: string;
  backgroundColor?: string;
  description?: string;
  data?: Record<string, TALeak[]>;
}

export interface TALeak {
  name: string;
  extra?: string;
  description?: string;
  track_length?: string;
  leak_date?: string;
  file_date?: string;
  type?: string;
  available_length?: string;
  quality?: string;
  url?: string;
  urls?: string[] | undefined;
}

export interface TrackerResponse {
  name: string | null | undefined;
  tabs: string[];
  current_tab: string;
  eras: Record<string, Era>;
}

function getImageFilename(artistName: string): string {
  return artistName.toLowerCase().replace(/[^a-z0-9]/g, "") + ".webp";
}

function parseCSV(csvText: string): Artist[] {
  const lines = csvText.trim().split("\n");
  const items: Artist[] = [];
  const nameCount: Record<string, number> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const matches = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(v => v.replace(/^"|"$/g, "").trim()) || [];
    if (matches.length < 6) continue;
    const [name, url, , isLinkWorkingStr, isUpdatedStr, isStarredStr] = matches;
    if (name && url) {
      const count = nameCount[name] || 0;
      nameCount[name] = count + 1;
      const newName = count === 0 ? name : `${name} [Alt${count > 1 ? ` #${count}` : ""}]`;
      items.push({
        name: newName,
        url,
        imageFilename: getImageFilename(newName),
        isLinkWorking: isLinkWorkingStr?.toLowerCase() === "yes",
        isUpdated: isUpdatedStr?.toLowerCase() === "yes",
        isStarred: isStarredStr?.toLowerCase() === "yes"
      });
    }
  }
  return items;
}

export const getArtists = cache(async (): Promise<Artist[]> => {
  const sources = [
    "https://sheets.artistgrid.cx/artists.csv",
    "/backup.csv",
    "https://artistgrid.cx/backup.csv"
  ];

  for (const url of sources) {
    try {
      const response = await fetch(url, { next: { revalidate: 1800 } });
      if (!response.ok) continue;
      const csv = await response.text();
      return parseCSV(csv);
    } catch (error) {
      console.error(`Failed to fetch from ${url}:`, error);
    }
  }

  return [];
});

export const getTrends = cache(async (): Promise<Map<string, number>> => {
  try {
    const response = await fetch(TRENDS_API, { next: { revalidate: 1800 } });
    if (!response.ok) return new Map();
    const data = await response.json();
    const map = new Map<string, number>();
    data.results?.forEach((item: any) => map.set(item.name, item.visitors || 0));
    return map;
  } catch {
    return new Map();
  }
});

export const getTestedTrackers = cache(async (): Promise<string[]> => {
  try {
    const response = await fetch(`${API_BASE}/tested`, {
      headers: { "X-Api-Key": API_KEY || "" },
      next: { revalidate: 3600 }
    });
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
});

export const getVisitorCount = cache(async (): Promise<number | null> => {
  try {
    const res = await fetch("https://121124.prigoana.com/artistgrid.cx/", { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const data = await res.json();
    return Number(data.count) || null;
  } catch {
    return null;
  }
});

export const getTrackerData = cache(async (trackerId: string, tab?: string): Promise<TrackerResponse | null> => {
  try {
    const url = tab
      ? `${API_BASE}/get/${trackerId}?tab=${encodeURIComponent(tab)}`
      : `${API_BASE}/get/${trackerId}`;

    const response = await fetch(url, {
      headers: { "X-Api-Key": API_KEY || "" },
      next: { revalidate: 3600 }
    });

    if (!response.ok) return null;
    const json = await response.json();

    if (!json || typeof json !== "object" || !json.eras || Object.keys(json.eras).length === 0) {
      return null;
    }

    return json;
  } catch {
    return null;
  }
});

function normalizePillowsUrl(url: string): string {
  return url.replace(/pillowcase\.su/g, "pillows.su");
}

function extractKrakenId(url: string): string | null {
  const match = url.match(/krakenfiles\.com\/view\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function extractImgurId(url: string): string | null {
  const match = url.match(/imgur\.gg\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function extractPixeldrainId(url: string): string | null {
  const match = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function extractSoundcloudPath(url: string): string | null {
  const match = url.match(/soundcloud\.com\/([^\/]+\/[^\/\?]+)/);
  return match ? match[1] : null;
}

type TrackSource = "pillows" | "froste" | "krakenfiles" | "juicewrldapi" | "imgur" | "pixeldrain" | "soundcloud" | "unknown";

function getTrackSource(url: string): TrackSource {
  const normalized = normalizePillowsUrl(url);
  if (normalized.includes("pillows.su/f/")) return "pillows";
  if (normalized.includes("music.froste.lol/song/")) return "froste";
  if (normalized.includes("krakenfiles.com/view/")) return "krakenfiles";
  if (normalized.includes("juicewrldapi.com/juicewrld")) return "juicewrldapi";
  if (normalized.includes("imgur.gg/")) return "imgur";
  if (normalized.includes("pixeldrain.com/u/")) return "pixeldrain";
  if (normalized.includes("soundcloud.com/")) return "soundcloud";
  return "unknown";
}

export async function resolvePlayableUrl(url: string): Promise<string | null> {
  const normalized = normalizePillowsUrl(url);
  const source = getTrackSource(normalized);

  switch (source) {
    case "pillows": {
      const match = normalized.match(/pillows\.su\/f\/([a-f0-9]+)/);
      return match ? `https://api.pillows.su/api/download/${match[1]}` : null;
    }
    case "froste": {
      const match = normalized.match(/music\.froste\.lol\/song\/([a-f0-9]+)/);
      return match ? `https://music.froste.lol/song/${match[1]}/download` : null;
    }
    case "krakenfiles": {
      const id = extractKrakenId(normalized);
      if (!id) return null;
      try {
        const res = await fetch(`${KRAKENFILES_API}${id}`);
        const data = await res.json();
        return data.success ? data.m4a : null;
      } catch {
        return null;
      }
    }
    case "imgur": {
      const id = extractImgurId(normalized);
      if (!id) return null;
      try {
        const res = await fetch(`${IMGUR_API}${id}`);
        const data = await res.json();
        return data.success ? data.mp3 : null;
      } catch {
        return null;
      }
    }
    case "pixeldrain": {
      const id = extractPixeldrainId(normalized);
      return id ? `https://pixeldrain.com/api/file/${id}` : null;
    }
    case "soundcloud": {
      const path = extractSoundcloudPath(normalized);
      return path ? `https://sc.bloat.cat/_/restream/${path}?metadata=true` : null;
    }
    case "juicewrldapi":
      return url;
    default:
      return null;
  }
}

export async function resolveMultipleUrls(urls: string[]): Promise<Record<string, string | null>> {
  const results: Record<string, string | null> = {};
  const batchSize = 10;

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const resolved = await Promise.all(
      batch.map(async (url) => ({
        url,
        playable: await resolvePlayableUrl(url)
      }))
    );

    for (const { url, playable } of resolved) {
      results[url] = playable;
    }
  }

  return results;
}
