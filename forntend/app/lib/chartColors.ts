// Keep the chosen color first and generate contrasting shades for every slice.
export function createPiePalette(baseColor: string, sliceCount: number): string[] {
  const color = /^#[0-9a-f]{6}$/i.test(baseColor) ? baseColor : "#f59e0b";
  const channels = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  const count = Math.max(1, sliceCount);

  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return color;
    // Interleave near and far shades, including for black or white bases.
    const lightBase = channels.reduce((sum, value) => sum + value, 0) / 3 > 127;
    const target = lightBase ? 0 : 255;
    const step = index % 2 === 1 ? Math.ceil(index / 2) : count - index / 2;
    const weight = 0.15 + (step / count) * 0.7;
    return `#${channels.map((channel) =>
      Math.round(channel + (target - channel) * weight).toString(16).padStart(2, "0"),
    ).join("")}`;
  });
}
