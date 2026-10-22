export type DeviceKind = "phone" | "tablet" | "desktop";

export interface DeviceSummary {
  kind: DeviceKind;
  /** e.g. "Mac", "Windows", "iPhone", "Android phone". */
  device: string;
  /** e.g. "Chrome 129". */
  browser: string;
}

const major = (ua: string, re: RegExp) => re.exec(ua)?.[1]?.split(".")[0];

/** Enough to label a session row; not a full UA parser. Order matters: Edge and Opera also say Chrome. */
export function describeUserAgent(
  ua: string | null | undefined,
): DeviceSummary {
  if (!ua)
    return {
      kind: "desktop",
      device: "Unknown device",
      browser: "Unknown browser",
    };

  const isIpad =
    /iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile\//.test(ua));
  const isTablet = isIpad || (/Android/.test(ua) && !/Mobile/.test(ua));
  const isPhone =
    !isTablet && /iPhone|Android.*Mobile|Mobile Safari|Windows Phone/.test(ua);

  let device = "Unknown device";
  if (/iPhone/.test(ua)) device = "iPhone";
  else if (isIpad) device = "iPad";
  else if (/Android/.test(ua))
    device = isTablet ? "Android tablet" : "Android phone";
  else if (/CrOS/.test(ua)) device = "Chromebook";
  else if (/Macintosh|Mac OS X/.test(ua)) device = "Mac";
  else if (/Windows/.test(ua)) device = "Windows PC";
  else if (/Linux/.test(ua)) device = "Linux PC";

  const versioned = (name: string, v: string | undefined) =>
    v ? `${name} ${v}` : name;
  let browser = "Unknown browser";
  if (/Edg(e|A|iOS)?\//.test(ua))
    browser = versioned("Edge", major(ua, /Edg(?:e|A|iOS)?\/([\d.]+)/));
  else if (/OPR\/|Opera/.test(ua))
    browser = versioned("Opera", major(ua, /OPR\/([\d.]+)/));
  else if (/SamsungBrowser\//.test(ua))
    browser = versioned(
      "Samsung Internet",
      major(ua, /SamsungBrowser\/([\d.]+)/),
    );
  else if (/Firefox\/|FxiOS\//.test(ua))
    browser = versioned("Firefox", major(ua, /(?:Firefox|FxiOS)\/([\d.]+)/));
  else if (/Chrome\/|CriOS\//.test(ua))
    browser = versioned("Chrome", major(ua, /(?:Chrome|CriOS)\/([\d.]+)/));
  else if (/Safari\//.test(ua))
    browser = versioned("Safari", major(ua, /Version\/([\d.]+)/));
  else if (/curl|node|axios|python/i.test(ua)) browser = "API client";

  return {
    kind: isTablet ? "tablet" : isPhone ? "phone" : "desktop",
    device,
    browser,
  };
}
