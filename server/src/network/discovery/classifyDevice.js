/**
 * Best-effort device type from what discovery can see. Deliberately conservative: when nothing
 * clearly matches, the answer is "unknown" (the user can set the type later). Values must exist
 * in the device_types table.
 */

const HOSTNAME_RULES = [
  [/iphone|android|pixel-?\d|galaxy-?[sazn]\d|oneplus|redmi/i, 'phone'],
  [/ipad|galaxy-?tab|kindle|fire-?hd/i, 'tablet'],
  [/macbook|imac|mac-?mini|mac-?pro|mac-?studio|thinkpad|laptop|desktop|workstation/i, 'computer'],
  [/printer|laserjet|officejet|deskjet|^brn[0-9a-f]{6,}|^epson|^canon/i, 'printer'],
  [/apple-?tv|roku|chromecast|fire-?tv|firestick|bravia|smart-?tv|webos|tizen/i, 'tv'],
  [/sonos|homepod|echo-?dot|amazon-?echo|google-?home|nest-?(mini|audio|hub)/i, 'speaker'],
  [/playstation|^ps[45]-|xbox|nintendo/i, 'game_console'],
  [/synology|diskstation|qnap/i, 'nas'],
  [/ipcam|doorbell|camera/i, 'camera'],
  [/^esp[-_]|tasmota|shelly|smart-?plug|hue-?bridge|ecobee/i, 'iot'],
];

const VENDOR_RULES = [
  [/raspberry pi/i, 'computer'],
  [/sonos/i, 'speaker'],
  [/brother industries|seiko epson|canon inc|lexmark|kyocera|xerox|ricoh/i, 'printer'],
  [/roku|vizio/i, 'tv'],
  [/nintendo|sony interactive/i, 'game_console'],
  [/synology|qnap/i, 'nas'],
  [/hikvision|dahua|axis communications|reolink/i, 'camera'],
  [/espressif|tuya|shelly|signify|ecobee|nest labs/i, 'iot'],
];

function match(rules, value) {
  if (!value) return null;
  return rules.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}

/**
 * @param {{ isGateway: boolean, isSelf: boolean, hostname: string | null, vendor: string | null }} device
 * @returns {string} a device_types code
 */
export function classifyDevice({ isGateway, isSelf, hostname, vendor }) {
  if (isGateway) return 'router';
  if (isSelf) return 'computer';
  return match(HOSTNAME_RULES, hostname) ?? match(VENDOR_RULES, vendor) ?? 'unknown';
}
