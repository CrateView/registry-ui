import { formatDate } from '~/utils/date-format';

export function useFormatting() {
  const { locale, t } = useI18n();
  const number = (value: number | string | undefined) => new Intl.NumberFormat(locale.value).format(Number(value || 0));
  const config = useRuntimeConfig();
  const date = (value?: string | number | Date | null) => formatDate(value, config.public.dateFormat);
  const bytes = (value?: number | string) => {
    const size = Number(value || 0);
    const unit = size > 0 ? Math.min(4, Math.floor(Math.log(size) / Math.log(1024))) : 0;
    return `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(size / 1024 ** unit)} ${['B', 'KiB', 'MiB', 'GiB', 'TiB'][unit]}`;
  };
  const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      useToast().add({ title: t('copied'), icon: 'i-lucide-check', color: 'success' });
    } catch {
      useToast().add({ title: t('copyFailed'), color: 'error' });
    }
  };
  return { number, date, bytes, errorMessage, copy };
}
