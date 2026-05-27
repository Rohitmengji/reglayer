/**
 * SSRF protection — blocks scan requests to internal/private networks.
 * 
 * Prevents attackers from using the scanner to probe:
 * - AWS metadata (169.254.169.254)
 * - Internal services (localhost, 127.x, 10.x, 172.16-31.x, 192.168.x)
 * - Link-local addresses
 * - IPv6 loopback
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

const PRIVATE_IP_RANGES = [
  // IPv4
  /^127\./,                    // Loopback
  /^10\./,                     // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./, // Class B private
  /^192\.168\./,               // Class C private
  /^169\.254\./,               // Link-local (AWS metadata)
  /^0\./,                      // Current network
  // IPv6
  /^::1$/,                     // Loopback
  /^fe80:/i,                   // Link-local
  /^fc00:/i,                   // Unique local
  /^fd/i,                      // Unique local
];

/**
 * Validate that a URL is safe to scan (not internal/private).
 * Returns an error message if blocked, null if safe.
 */
export function validateScanUrl(urlString: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return "Invalid URL format";
  }

  // Only allow http/https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Only HTTP and HTTPS URLs are allowed";
  }

  // Block known internal hostnames
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return "Scanning internal addresses is not allowed";
  }

  // Block private IP ranges
  for (const pattern of PRIVATE_IP_RANGES) {
    if (pattern.test(hostname)) {
      return "Scanning private/internal IP addresses is not allowed";
    }
  }

  // Block ports commonly used for internal services
  const port = parsed.port ? parseInt(parsed.port) : null;
  if (port && (port === 6379 || port === 5432 || port === 3306 || port === 27017)) {
    return "Scanning database ports is not allowed";
  }

  return null; // Safe
}
