/**
 * Calculate "real accel" — a DPI-normalized acceleration value that allows
 * direct comparison between players at different DPI settings.
 *
 * For cl_mouseAccelStyle 0 (legacy/default):
 *   real_accel = (((dpi × windows_sens) / 2.54)² × m_yaw × cl_mouseAccel) / 1000
 *
 * For raw input, windows_sens = 1.
 *
 * Style 1 (power curve) uses a different formula and is not supported.
 *
 * Source: https://funender.com/quake/mouse/index.html
 */

interface AccelPlayerData {
  dpi?: number;
  acceleration?: boolean;
  accelValue?: number | null;
  accelStyle?: number | null;
  m_yaw?: number;
  windowsSensitivity?: number | null;
  rawInput?: boolean;
}

export function calculateRealAccel(playerData: AccelPlayerData): number | null {
  // No accel or no accel value
  if (!playerData.acceleration || !playerData.accelValue || playerData.accelValue <= 0) {
    return null;
  }

  // Can't calculate without DPI
  if (!playerData.dpi) {
    return null;
  }

  // Style 1 uses power curve — different formula, not supported
  if (playerData.accelStyle === 1) {
    return null;
  }

  const yaw = playerData.m_yaw || 0.022;
  // For raw input, windows sensitivity is effectively 1
  const windowsSens = playerData.rawInput ? 1 : (playerData.windowsSensitivity || 1);

  const dpiTerm = (playerData.dpi * windowsSens) / 2.54;
  const realAccel = (Math.pow(dpiTerm, 2) * yaw * playerData.accelValue) / 1000;

  return Math.round(realAccel * 100) / 100;
}
