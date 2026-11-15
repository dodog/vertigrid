export function easeOutCubic(t) {
    const u = t - 1;
    return u * u * u + 1;
}
