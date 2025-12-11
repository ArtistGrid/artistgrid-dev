import { getArtists, getTrends, getTestedTrackers, getVisitorCount } from "./actions";
import ArtistGalleryClient from "./components/ArtistGalleryClient";

export const revalidate = 1800;

export default async function ArtistGallery() {
  const [artists, trendsMap, testedTrackers, visitorCount] = await Promise.all([
    getArtists(),
    getTrends(),
    getTestedTrackers(),
    getVisitorCount()
  ]);

  const trends = Array.from(trendsMap.entries()).map(([name, visitors]) => ({ name, visitors }));

  return (
    <ArtistGalleryClient
      initialArtists={artists}
      initialTrends={trends}
      testedTrackers={testedTrackers}
      visitorCount={visitorCount}
    />
  );
}
