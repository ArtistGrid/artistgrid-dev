"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Menu, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import Fuse from "fuse.js";

interface Artist {
  name: string;
  url: string;
  imageFilename: string;
}

export default function ArtistGallery() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [filteredArtists, setFilteredArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const getImageFilename = (artistName: string): string => {
    return artistName.toLowerCase().replace(/[^a-z0-9]/g, "") + ".png";
  };

  const parseCSV = (csvText: string): Artist[] => {
    const lines = csvText.trim().split("\n");
    const artists: Artist[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        if (matches && matches.length >= 2) {
          const name = matches[0].replace(/^"|"$/g, "").trim();
          const url = matches[1].replace(/^"|"$/g, "").trim();

          if (name && url) {
            artists.push({
              name,
              url,
              imageFilename: getImageFilename(name),
            });
          }
        }
      }
    }

    return artists;
  };

  useEffect(() => {
    const fetchArtists = async () => {
      try {
        const response = await fetch("http://artistgrid.cx/trackers.csv");
        if (!response.ok) {
          throw new Error("Failed to fetch CSV data");
        }

        const csvText = await response.text();
        const parsedArtists = parseCSV(csvText);
        setArtists(parsedArtists);
        setFilteredArtists(parsedArtists);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchArtists();
  }, []);

  // Debounced fuzzy search
  useEffect(() => {
    const debounceTimeout = 150;
    const handler = setTimeout(() => {
      if (searchQuery.trim() === "") {
        setFilteredArtists(artists);
        return;
      }
      const fuse = new Fuse(artists, {
        keys: ["name"],
        threshold: 0.4,
      });
      const results = fuse.search(searchQuery).map((result) => result.item);
      setFilteredArtists(results);
    }, debounceTimeout);

    return () => clearTimeout(handler);
  }, [searchQuery, artists]);

  useEffect(() => {
    if (!showInfoModal) return;

    const handleKeyDown = () => setShowInfoModal(false);
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showInfoModal]);

  const handleArtistClick = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black p-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {Array.from({ length: 10 }).map((_, i) => (
              <Card
                key={i}
                className="bg-black border-white border-2 rounded-lg"
              >
                <CardContent className="p-4">
                  <Skeleton className="aspect-square w-full mb-3 bg-white rounded-lg" />
                  <Skeleton className="h-4 w-3/4 bg-white rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Error</h1>
          <p className="text-white">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-6">
      {!showInfoModal ? (
        <button
          onClick={() => setShowInfoModal(true)}
          className="fixed top-6 left-6 z-50 p-2 bg-black border-2 border-white/40 text-white hover:bg-white hover:text-black hover:border-white focus:border-white transition-colors rounded-lg"
          aria-label="Open info menu"
        >
          <Menu className="w-6 h-6" />
        </button>
      ) : (
        <button
          onClick={() => setShowInfoModal(false)}
          className="fixed top-6 left-6 z-50 p-2 bg-black border-2 border-white/40 text-white hover:bg-white hover:text-black hover:border-white focus:border-white transition-colors rounded-lg"
          aria-label="Close info modal"
        >
          <X className="w-6 h-6" />
        </button>
      )}

      {showInfoModal && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50"
          onClick={() => setShowInfoModal(false)}
        >
          <div
            className="bg-black border-2 border-white mx-4 mt-4 p-6 max-w-2xl rounded-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1 text-center">
                <h2 className="text-2xl font-bold text-white underline">
                  About ArtistGrid
                </h2>
              </div>
            </div>
            <div className="text-white space-y-4">
              <p>
                This website is owned &amp; maintained by{" "}
                <a
                  href="https://discord.com/users/454283756258197544"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  justAMZ
                </a>{" "}
                and{" "}
                <a
                  href="https://prigoana.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  eduardprigoana
                </a>
                . All original trackers referenced on this site can be found in{" "}
                <a
                  href="https://docs.google.com/spreadsheets/d/1zoOIaNbBvfuL3sS3824acpqGxOdSZSIHM8-nI9C-Vfc/htmlview"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  this Google Sheet
                </a>
                .
                <br />
                <br />
                Note: if a tracker doesn't load / has very little content, go to
                the "this Google Sheet" link at the top of the page.<br></br>
                <br></br>We are not associated or endorsed by TrackerHub or any
                of the artists on this page.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-white mb-4">
            TrackerHub Artist Grid
          </h1>
          <Input
            type="text"
            placeholder="Search artists..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-black border-2 text-white/40 border-white/40 hover:border-white hover:text-white transition-all duration-200 cursor-pointer group rounded-lg"
          />
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {filteredArtists.map((artist, index) => (
            <Card
              key={index}
              className="bg-black border-2 border-white/40 hover:border-white hover:bg-white hover:text-black transition-all duration-200 cursor-pointer group rounded-lg"
              onClick={() => handleArtistClick(artist.url)}
            >
              <CardContent className="p-4">
                <div className="aspect-square w-full mb-3 bg-white border-2 border-none flex items-center justify-center overflow-hidden rounded-lg">
                  <img
                    src={`/images/${artist.imageFilename}`}
                    alt={artist.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = `/placeholder.svg?height=200&width=200&text=${encodeURIComponent(
                        artist.name.charAt(0)
                      )}&bg=000000&color=ffffff`;
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white group-hover:text-black text-sm leading-tight transition-colors">
                    {artist.name}
                  </h3>
                  <ExternalLink className="w-4 h-4 text-white group-hover:text-black transition-colors" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredArtists.length === 0 && !loading && (
          <div className="text-center py-12">
            <p className="text-white">No artists found in the CSV file.</p>
          </div>
        )}
      </div>
    </div>
  );
}
