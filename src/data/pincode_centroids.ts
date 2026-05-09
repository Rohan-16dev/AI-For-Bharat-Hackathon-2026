
/**
 * Karnataka Pincode Centroid Reference Table (Synthetic Sample)
 * As per Section 3 Pass 3 instructions.
 */
export const KARNATAKA_PINCODES: Record<string, { lat: number, lng: number, city: string, area: string }> = {
  "560058": { lat: 12.9716, lng: 77.5946, city: "Bangalore", area: "Peenya Industrial Area" },
  "560001": { lat: 12.9800, lng: 77.6100, city: "Bangalore", area: "MG Road/CBD" },
  "560034": { lat: 12.9600, lng: 77.5800, city: "Bangalore", area: "Koramangala" },
  "560063": { lat: 13.1000, lng: 77.5900, city: "Bangalore", area: "Yelahanka" },
  "560102": { lat: 12.9100, lng: 77.6400, city: "Bangalore", area: "HSR Layout" },
  "560066": { lat: 12.9600, lng: 77.7500, city: "Bangalore", area: "Whitefield" },
  "560076": { lat: 12.8900, lng: 77.6100, city: "Bangalore", area: "BTM Layout" },
  "580001": { lat: 15.3647, lng: 75.1240, city: "Hubli", area: "Hubli West" },
  "575001": { lat: 12.8701, lng: 74.8400, city: "Mangalore", area: "Hampankatta" },
  "570001": { lat: 12.3072, lng: 76.6498, city: "Mysore", area: "Mysore Palace Area" },
  "585101": { lat: 17.3297, lng: 76.8343, city: "Gulbarga", area: "Station Road" },
  "583101": { lat: 15.1394, lng: 76.9242, city: "Bellary", area: "Main Market" },
  "560099": { lat: 12.8100, lng: 77.6700, city: "Bangalore", area: "Electronic City Phase 1" },
  "560100": { lat: 12.8500, lng: 77.6600, city: "Bangalore", area: "Electronic City Phase 2" },
};

export const findCentroid = (pincode: string) => {
  return KARNATAKA_PINCODES[pincode] || null;
};
