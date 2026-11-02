export default defineAppConfig({
  ui: {
    colors: { primary: 'red', neutral: 'zinc' },
    breadcrumb: {
      slots: {
        list: 'flex-wrap',
        item: 'min-w-0 max-w-full',
        link: 'min-w-0',
        linkLabel: 'text-xs min-w-0 max-w-48 truncate',
        linkLeadingIcon: 'size-4',
        separatorIcon: 'size-3.5',
      },
    },
  },
  theme: { radius: '0.5rem', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' },
})
