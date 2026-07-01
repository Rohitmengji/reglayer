/**
 * RegLayer — Multi-Region Scan Configuration
 *
 * Defines the supported scan regions and their browser environment settings.
 * Each region simulates scanning from that geographic location by setting
 * the Accept-Language, timezone, and geolocation headers that a browser from
 * that region would send. This surfaces geo-specific content differences
 * (GDPR banners, regional nav, CDN-served variants, etc.).
 *
 * NOTE: Phase 1 uses header/locale simulation. Phase 2 will use actual
 * geo-distributed proxies (Vercel Edge, AWS Lambda@Edge, or Browserless
 * regional endpoints) for true IP-based geo-targeting.
 */

export interface RegionConfig {
  id: string;
  name: string;
  flag: string;
  timezone: string;
  locale: string;
  acceptLanguage: string;
  /** Approximate latitude/longitude for geolocation API simulation */
  geolocation: { latitude: number; longitude: number };
}

export const SCAN_REGIONS: RegionConfig[] = [
  {
    id: "us-east",
    name: "US East (Virginia)",
    flag: "🇺🇸",
    timezone: "America/New_York",
    locale: "en-US",
    acceptLanguage: "en-US,en;q=0.9",
    geolocation: { latitude: 39.0438, longitude: -77.4874 },
  },
  {
    id: "eu-west",
    name: "EU West (Ireland)",
    flag: "🇪🇺",
    timezone: "Europe/Dublin",
    locale: "en-IE",
    acceptLanguage: "en-IE,en;q=0.9,en-GB;q=0.8",
    geolocation: { latitude: 53.3498, longitude: -6.2603 },
  },
  {
    id: "eu-central",
    name: "EU Central (Frankfurt)",
    flag: "🇩🇪",
    timezone: "Europe/Berlin",
    locale: "de-DE",
    acceptLanguage: "de-DE,de;q=0.9,en;q=0.8",
    geolocation: { latitude: 50.1109, longitude: 8.6821 },
  },
  {
    id: "ap-south",
    name: "Asia Pacific (Mumbai)",
    flag: "🇮🇳",
    timezone: "Asia/Kolkata",
    locale: "en-IN",
    acceptLanguage: "en-IN,en;q=0.9,hi;q=0.8",
    geolocation: { latitude: 19.076, longitude: 72.8777 },
  },
  {
    id: "ap-east",
    name: "Asia Pacific (Tokyo)",
    flag: "🇯🇵",
    timezone: "Asia/Tokyo",
    locale: "ja-JP",
    acceptLanguage: "ja-JP,ja;q=0.9,en;q=0.8",
    geolocation: { latitude: 35.6762, longitude: 139.6503 },
  },
];

export const DEFAULT_REGION = "us-east";

export const REGION_IDS = SCAN_REGIONS.map((r) => r.id);

export function getRegionConfig(regionId: string): RegionConfig | undefined {
  return SCAN_REGIONS.find((r) => r.id === regionId);
}

export function isValidRegion(id: string): boolean {
  return REGION_IDS.includes(id);
}
