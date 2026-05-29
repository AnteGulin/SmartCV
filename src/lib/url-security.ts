import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { ApiRouteError } from "@/lib/api-guards";

const REJECTED_HOSTNAMES = new Set(["localhost", "local"]);
const REJECTED_HOSTNAME_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home",
  ".corp",
  ".localdomain",
];

export function parseAndValidateExternalUrl(rawUrl: string) {
  const trimmedUrl = rawUrl.trim();

  if (!trimmedUrl) {
    throw new ApiRouteError(400, "Enter a valid http or https job URL.");
  }

  let url: URL;
  try {
    url = new URL(trimmedUrl);
  } catch {
    throw new ApiRouteError(400, "Enter a valid http or https job URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ApiRouteError(400, "Enter a valid http or https job URL.");
  }

  if (!url.hostname) {
    throw new ApiRouteError(400, "Enter a valid job URL with a public hostname.");
  }

  if (url.username || url.password) {
    throw new ApiRouteError(
      400,
      "Job URLs with embedded credentials are not supported.",
    );
  }

  const normalizedHost = normalizeHost(url.hostname);

  if (isRejectedHostname(normalizedHost)) {
    throw new ApiRouteError(
      400,
      "Local or internal job URLs are not supported for automatic fetch.",
    );
  }

  if (isPrivateOrLocalAddress(normalizedHost)) {
    throw new ApiRouteError(
      400,
      "Local or private network job URLs are not supported for automatic fetch.",
    );
  }

  return url;
}

export async function assertPublicResolvableHostname(url: URL) {
  const hostname = normalizeHost(url.hostname);

  if (isPrivateOrLocalAddress(hostname)) {
    throw new ApiRouteError(
      400,
      "Local or private network job URLs are not supported for automatic fetch.",
    );
  }

  let addresses: LookupAddress[];

  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new ApiRouteError(
      400,
      "Could not resolve that job URL. Paste the job text manually instead.",
    );
  }

  if (!addresses.length) {
    throw new ApiRouteError(
      400,
      "Could not resolve that job URL. Paste the job text manually instead.",
    );
  }

  if (addresses.some((entry) => isPrivateOrLocalAddress(normalizeHost(entry.address)))) {
    throw new ApiRouteError(
      400,
      "That job URL resolved to a private or local network address, so SmartCV will not fetch it.",
    );
  }
}

function isRejectedHostname(hostname: string) {
  if (!hostname) {
    return true;
  }

  if (REJECTED_HOSTNAMES.has(hostname)) {
    return true;
  }

  if (REJECTED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return true;
  }

  if (!hostname.includes(".") && net.isIP(hostname) === 0) {
    return true;
  }

  return false;
}

function normalizeHost(hostname: string) {
  return hostname.trim().replace(/^\[|\]$/g, "").toLowerCase();
}

function isPrivateOrLocalAddress(address: string) {
  const normalizedAddress = normalizeHost(address);
  const mappedIpv4 = extractMappedIpv4(normalizedAddress);

  if (mappedIpv4) {
    return isPrivateIpv4(mappedIpv4);
  }

  const ipFamily = net.isIP(normalizedAddress);

  if (ipFamily === 4) {
    return isPrivateIpv4(normalizedAddress);
  }

  if (ipFamily === 6) {
    return isPrivateIpv6(normalizedAddress);
  }

  return false;
}

function extractMappedIpv4(address: string) {
  if (!address.startsWith("::ffff:")) {
    return null;
  }

  const candidate = address.slice("::ffff:".length);
  return net.isIP(candidate) === 4 ? candidate : null;
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }

  const [first, second] = parts;

  if (first === 0 || first === 10 || first === 127) {
    return true;
  }

  if (first === 100 && second >= 64 && second <= 127) {
    return true;
  }

  if (first === 169 && second === 254) {
    return true;
  }

  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }

  if (first === 192 && second === 168) {
    return true;
  }

  return false;
}

function isPrivateIpv6(address: string) {
  if (address === "::" || address === "::1") {
    return true;
  }

  const firstHextet = Number.parseInt(address.split(":")[0] || "0", 16);

  if (!Number.isFinite(firstHextet)) {
    return true;
  }

  if (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) {
    return true;
  }

  if (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) {
    return true;
  }

  return false;
}
