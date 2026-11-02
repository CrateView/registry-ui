import type { Branding } from '#shared/branding';

export function useBranding() {
  const config = useRuntimeConfig().public;
  const { data } = useNuxtData<Branding>('branding');
  return computed<Branding>(
    () =>
      data.value || {
        logoLight: config.brandLogoLight,
        logoDark: config.brandLogoDark,
        favicon: config.brandFavicon,
        pwaIcon192: config.brandPwaIcon_192,
        pwaIcon512: config.brandPwaIcon_512,
      },
  );
}
