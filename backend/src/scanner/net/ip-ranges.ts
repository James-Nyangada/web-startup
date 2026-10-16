import ipaddr from 'ipaddr.js';

/** Spec 11.2 step 2: any resolved address in these ranges is refused. */
const BLOCKED_CIDRS = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24', // TEST-NET-1
  '192.168.0.0/16',
  '198.18.0.0/15',
  '198.51.100.0/24', // TEST-NET-2
  '203.0.113.0/24', // TEST-NET-3
  '224.0.0.0/4',
  '240.0.0.0/4',
  '::/128',
  '::1/128',
  '64:ff9b:1::/48', // local-use NAT64
  '100::/64', // discard-only
  '2001:db8::/32', // documentation
  'fc00::/7',
  'fe80::/10',
  'ff00::/8', // multicast
].map((cidr) => ipaddr.parseCIDR(cidr));

/** True when the address is private, loopback, link-local or otherwise not on the public internet. */
export function isBlockedAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return true;
  let parsed = ipaddr.parse(address);

  // ::ffff:10.0.0.1 and friends: judge the embedded IPv4 address.
  if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
    parsed = (parsed as ipaddr.IPv6).toIPv4Address();
  }

  return BLOCKED_CIDRS.some(
    ([range, bits]) => parsed.kind() === range.kind() && parsed.match(range, bits),
  );
}

export const isPublicAddress = (address: string): boolean => !isBlockedAddress(address);
