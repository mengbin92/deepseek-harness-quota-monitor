/**
 * Host plugin body — no host-side behavior for this surface plugin. The
 * browser half ships via exports["./client"], discovered through the
 * package.json dsh.client declaration.
 */
export function apply(): void {}
