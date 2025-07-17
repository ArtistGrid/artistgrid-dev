"use client";

import { useToast } from "@/components/ui/use-toast";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyIcon, Menu, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import Fuse from "fuse.js";
import Image from "next/image";

interface Artist {
  name: string;
  url: string;
  imageFilename: string;
}

export default function ArtistGallery() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [visitorCount, setVisitorCount] = useState<number | null>(null);
  const [filteredArtists, setFilteredArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

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

  // Fetch visitor count
  useEffect(() => {
    fetch("https://111224.artistgrid.cx/artistgrid.cx/")
      .then((res) => res.json())
      .then((data) => setVisitorCount(data.count))
      .catch((err) => console.error("Error fetching visitor count:", err));
  }, []);

  // Fetch and parse CSV artists
  useEffect(() => {
    const fetchArtists = async () => {
      try {
        const response = await fetch("./sheet.csv");
        if (!response.ok) throw new Error("Failed to fetch CSV data");

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

  // Filter artists by search query with debounce
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

  // Close info modal on any key press
  useEffect(() => {
    if (!showInfoModal) return;
    const handleKeyDown = () => setShowInfoModal(false);
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showInfoModal]);

  // Normalize URL helper
  const normalizeUrl = (url: string) => {
    if (!/^https?:\/\//i.test(url)) {
      return `https://trackerhub.cx/sh/${url}`;
    }
    return url;
  };

  // Handle artist card click
  const handleArtistClick = (url: string) => {
    const fullUrl = normalizeUrl(url);
    window.open(fullUrl, "_blank", "noopener,noreferrer");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black p-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {Array.from({ length: 10 }).map((_, i) => (
              <Card
                key={i}
                className="bg-black border-white border-2 rounded-2xl"
              >
                <CardContent className="p-4">
                  <Skeleton className="aspect-square w-full mb-3 bg-white rounded-2xl" />
                  <Skeleton className="h-4 w-3/4 bg-white rounded-full" />
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
      <button
        onClick={() => setShowInfoModal(!showInfoModal)}
        className="fixed top-6 left-6 z-50 p-3 bg-black border-2 border-white/40 text-white hover:bg-white hover:text-black hover:border-white focus:border-white transition-colors rounded-2xl"
        aria-label={showInfoModal ? "Close info modal" : "Open info menu"}
      >
        {showInfoModal ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {showInfoModal && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50"
          onClick={() => setShowInfoModal(false)}
        >
          <div
            className="bg-black border-2 border-white mx-4 mt-4 p-6 max-w-2xl rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-white underline text-center mb-4">
              About ArtistGrid
            </h2>
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
              </p>
              <p>
                Note: if a tracker doesn't load or has little content, visit the
                link above. We are not affiliated with TrackerHub or the artists
                listed here.
              </p>
              {visitorCount !== null && (
                <p className="text-sm text-gray-300">You are visitor #{visitorCount}</p>
              )}
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
            className="bg-black border-2 text-white/40 border-white/40 hover:border-white hover:text-white transition-all duration-200 cursor-pointer rounded-2xl"
          />
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {filteredArtists.map((artist, index) => (
            <Card
              key={index}
              className="bg-black border-2 border-white/40 hover:border-white hover:bg-white hover:text-black transition-all duration-200 cursor-pointer group rounded-2xl"
              onClick={() => handleArtistClick(artist.url)}
            >
              <CardContent className="p-4">
                <div className="aspect-square w-full mb-3 bg-white flex items-center justify-center overflow-hidden rounded-lg">
                <img
  src={`https://assets.artistgrid.cx/img/${artist.imageFilename}`}
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

                  <CopyIcon
  className="w-4 h-4 p-0 text-white group-hover:text-black transition-colors cursor-pointer"
  onClick={(e) => {
    e.stopPropagation();

    // Get full normalized URL
    const fullUrl = normalizeUrl(artist.url);

    // Copy to clipboard
    navigator.clipboard.writeText(fullUrl);

    // Optional animation
    const target = e.currentTarget;
    target.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.1)" },
        { transform: "scale(1)" },
      ],
      {
        duration: 200,
        easing: "ease-in-out",
      }
    );

    // Optional: show toast that full URL was copied
    toast({
      title: "Copied!",
      description: `${fullUrl} copied to clipboard.`,
    });
  }}
/>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredArtists.length === 0 && !loading && (
          <div className="text-center py-12">
            <p className="text-white">No artists found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
