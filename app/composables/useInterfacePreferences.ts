import { supportedLocales } from '#shared/locales';
import type { DropdownMenuItem } from '@nuxt/ui';
import { localePreferenceSchema, themePreferenceSchema } from '../../shared/preferences';
import { transitionTheme } from '../utils/theme-transition';

export function useInterfacePreferences() {
  const { t, locale, setLocale, setLocaleCookie } = useI18n();
  const colorMode = useColorMode();
  const origin = useState<{ x: number; y: number } | null>('theme-transition-origin', () => null);
  const themes = computed(() => [
    { value: 'system', label: t('system'), icon: 'i-lucide-monitor' },
    { value: 'light', label: t('light'), icon: 'i-lucide-sun' },
    { value: 'dark', label: t('dark'), icon: 'i-lucide-moon' },
  ]);
  async function selectTheme(value: unknown) {
    const parsed = themePreferenceSchema.safeParse(value);
    if (!parsed.success || colorMode.forced) return;
    await transitionTheme(async () => {
      colorMode.preference = parsed.data;
      await nextTick();
    }, origin.value);
  }
  async function selectLocale(value: unknown) {
    const parsed = localePreferenceSchema.safeParse(value);
    if (!parsed.success) return;
    await setLocale(parsed.data);
    setLocaleCookie(parsed.data);
  }
  const themeItems = computed<DropdownMenuItem[]>(() =>
    themes.value.map((theme) => ({
      label: theme.label,
      icon: theme.icon,
      type: 'checkbox',
      checked: colorMode.preference === theme.value,
      onSelect(event) {
        event.preventDefault();
        void selectTheme(theme.value);
      },
    })),
  );
  const languageItems = computed<DropdownMenuItem[]>(() =>
    supportedLocales.map((language) => ({
      label: language.name,
      type: 'checkbox',
      checked: locale.value === language.code,
      onSelect(event) {
        event.preventDefault();
        void selectLocale(language.code);
      },
    })),
  );
  return { colorMode, locale, themes, themeItems, languageItems, selectTheme, selectLocale };
}
