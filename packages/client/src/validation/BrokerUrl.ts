const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function hasCredentialsPathQueryOrFragment(url: URL): boolean {
  return Boolean(url.username || url.password || url.search || url.hash || url.pathname !== '/');
}

function usesHttpsOrLocalHttp(url: URL): boolean {
  return (
    url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTNAMES.has(url.hostname))
  );
}

/**
 * Check the broker's server address and return it in a consistent format.
 * Throws for invalid addresses. For example, https://BROKER.example.test:443/
 * becomes https://broker.example.test (the protocol, hostname and optional port).
 * Accepts HTTPS or loopback HTTP; rejects credentials, paths, query strings and fragments.
 * This validates endpoint configuration, not DNS resolution or SSRF safety.
 */
export function validateAndFormatBrokerUrl(brokerUrl: string): string {
  const url = new URL(brokerUrl);

  if (hasCredentialsPathQueryOrFragment(url)) {
    throw new Error('Invalid broker URL');
  }

  if (!usesHttpsOrLocalHttp(url)) {
    throw new Error('Broker URL must use HTTPS or loopback HTTP');
  }

  return url.origin;
}
