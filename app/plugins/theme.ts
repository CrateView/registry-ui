export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig().public;
  const app = useAppConfig();
  const theme = resolveTheme({ ...app.ui.colors, ...app.theme }, config);
  updateAppConfig({ ui: { colors: { primary: theme.primary, neutral: theme.neutral } } });
  useHead({
    style: [{ textContent: `:root{--ui-radius:${theme.radius};--font-sans:${theme.fontFamily}}` }],
  });
});
