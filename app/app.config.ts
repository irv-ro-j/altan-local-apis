export default defineAppConfig({
  ui: {
    colors: {
      primary: 'green',
      neutral: 'slate'
    },
    switch: {
      slots: {
        base: 'data-[state=unchecked]:bg-[var(--line)] data-[state=checked]:bg-[var(--aqua)]',
        thumb: 'bg-white',
        label: 'text-[var(--muted)] text-xs'
      }
    }
  }
})
