// cm/360 calculation - two modes:
// 1. Standard (m_cpi = 0): cm/360 = (360 / (m_yaw * dpi * sens)) * 2.54
// 2. With m_cpi > 0: cm/360 = (360 / sens) * (m_cpi / dpi)
// Sources:
//   https://funender.com/quake/mouse/index.html
//   https://www.esreality.com/post/2256180/re-mouse-sensitivity/
export function calculateCm360(playerData: any): number {
  if (playerData.dpi && playerData.sensitivity) {
    if (playerData.m_cpi && playerData.m_cpi > 0) {
      return Math.round(((360 / playerData.sensitivity) * (playerData.m_cpi / playerData.dpi)) * 100) / 100;
    }
    const yaw = playerData.m_yaw || 0.022;
    return Math.round(((360 / (yaw * playerData.dpi * playerData.sensitivity)) * 2.54) * 100) / 100;
  }
  return playerData.cm360 || 0;
}
