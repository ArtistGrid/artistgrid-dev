import { Suspense } from "react";
import { getTrackerData } from "../actions";
import TrackerViewClient from "./components/TrackerViewClient";
import Link from "next/link";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function getGoogleSheetsUrl(trackerId: string): string {
  return `https://docs.google.com/spreadsheets/d/${trackerId}/htmlview`;
}

async function TrackerViewContent({ searchParams }: { searchParams: Promise<{ id?: string; artist?: string; track?: string; tab?: string }> }) {
  const params = await searchParams;
  const trackerId = params.id || "";
  const artistName = params.artist || null;
  const trackParam = params.track || null;
  const tabParam = params.tab || undefined;

  if (!trackerId || trackerId.length !== 44) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-neutral-300 mb-2">Enter a Tracker ID to get started</h2>
          <p className="text-neutral-500">Tracker IDs are exactly 44 characters long</p>
          <Link href="/" className="text-sm text-neutral-500 hover:text-white transition-colors mt-4 inline-block">
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const data = await getTrackerData(trackerId, tabParam);

  if (!data) {
    const sheetsUrl = getGoogleSheetsUrl(trackerId);
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-neutral-950 border border-neutral-800 rounded-xl p-8 text-center">
          <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-white mb-4">Unable to Load Tracker</h1>
          <p className="text-neutral-400 mb-6">
            We couldn't load the tracker data. You can view the original spreadsheet directly on Google Sheets.
          </p>
          <Button asChild className="bg-white text-black hover:bg-neutral-200 mb-6 w-full">
            <a href={sheetsUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              Open Original Spreadsheet
            </a>
          </Button>
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-left">
            <p className="text-xs text-neutral-500 leading-relaxed">
              <strong className="text-neutral-400">Disclaimer:</strong> ArtistGrid is not affiliated with, endorsed by, or associated with Google, TrackerHub, or any artists whose content may appear in these trackers. We do not host, store, or distribute any copyrighted content. All data is sourced from publicly available Google Sheets and third-party services.
            </p>
          </div>
          <div className="mt-6">
            <Link href="/" className="text-sm text-neutral-500 hover:text-white transition-colors">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TrackerViewClient
      trackerId={trackerId}
      initialData={data}
      artistName={artistName}
      trackParam={trackParam}
      tabParam={tabParam}
    />
  );
}

export default function TrackerViewPage({ searchParams }: { searchParams: Promise<{ id?: string; artist?: string; track?: string; tab?: string }> }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex items-center gap-2 text-neutral-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading tracker data...</span>
        </div>
      </div>
    }>
      <TrackerViewContent searchParams={searchParams} />
    </Suspense>
  );
}
